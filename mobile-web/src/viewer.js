/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {History} from './history';
import {ViewerMessaging} from './viewer-messaging';
import {paramsToString} from './amp-url-creator';
import {log} from '../utils/log';
import {parseUrl} from '../utils/url';

/**
 * This file is a Viewer for AMP Documents.
 */
class Viewer {

  /**
   * @param {!Element} hostElement the element to attatch the iframe to.
   * @param {string} ampDocUrl the AMP Document url.
   * @param {string} opt_referrer
   * @param {boolean|undefined} opt_prerender
   */
  constructor(hostElement, ampDocUrl, opt_referrer, opt_prerender) {
    /** @private {ViewerMessaging} */
    this.viewerMessaging_ = null;

    /** @private {!Element} */
    this.hostElement_ = hostElement;

    /** @private {string} */
    this.ampDocUrl_ = ampDocUrl;

    /** @private {string} */
    this.referrer_ = opt_referrer;

    /** @private {boolean|undefined} */
    this.prerender_ = opt_prerender;

    /** @private {?Element} */
    this.iframe_ = null;

    /** @private {!History} */
    this.history_ = new History(this.handleChangeHistoryState_.bind(this));
  }

  /**
   * @param {!Function} showViewer method that shows the viewer.
   * @param {!Function} hideViewer method that hides the viewer.
   * @param {!function():boolean} isViewerHidden method that determines if viewer is hidden.
   */
  setViewerShowAndHide(showViewer, hideViewer, isViewerHidden) {
    /** @private {!Function} */
    this.showViewer_ = showViewer;
    /** @private {!Function} */
    this.hideViewer_ = hideViewer;
    /** @private {!Function} */
    this.isViewerHidden_ = isViewerHidden;
  }

  /**
   * @return {boolean} true if the viewer has already been loaded.
   * @private
   */
  isLoaded_() {
    return !!this.iframe_ && !!this.viewerMessaging_;
  }

  /**
   * Attaches the AMP Doc Iframe to the Host Element.
   */
  attach() {
    this.iframe_ = document.createElement('iframe');
    // TODO (chenshay): iframe_.setAttribute('scrolling', 'no')
    // to enable the scrolling workarounds for iOS.

    this.buildIframeSrc_().then(ampDocCachedUrl => {
      this.viewerMessaging_ = new ViewerMessaging(
        window,
        this.iframe_,
        parseUrl(ampDocCachedUrl).origin,
        this.messageHandler_.bind(this));

      this.viewerMessaging_.start().then(()=>{
        log('this.viewerMessaging_.start() Promise resolved !!!');
      });

      this.iframe_.src = ampDocCachedUrl;
      this.hostElement_.appendChild(this.iframe_);
      this.history_.pushState(this.ampDocUrl_);
    });
  }

  /**
   * @return {!Promise<string>}
   */
  buildIframeSrc_() {
    return Promise.resolve(
      `${this.ampDocUrl_}#${paramsToString(this.createInitParams_())}`);
  }

  /**
   * Computes the init params that will be used to create the AMP Cache URL.
   * @return {object} the init params.
   * @private
   */
  createInitParams_() {
    const parsedViewerUrl = parseUrl(window.location.href);

    const initParams = {
      'origin': parsedViewerUrl.origin,
      'cap': 'xhrInterceptor',
    };

    if (this.referrer_) initParams['referrer'] = this.referrer_;
    if (this.prerender_) {
      initParams['visibilityState'] = 'prerender';
      initParams['prerenderSize'] = 1;
    }

    return initParams;
  }

  /**
   * Detaches the AMP Doc Iframe from the Host Element 
   * and calls the hideViewer method.
   */
  unAttach() {
    if (this.hideViewer_) this.hideViewer_();
    this.hostElement_.removeChild(this.iframe_);
    this.iframe_ = null;
    this.viewerMessaging_ = null;
  }
  
  /**
   * @param {boolean} isLastBack true if back button was hit and viewer should hide.
   * @param {boolean} isAMP true if going to AMP document.
   * @private
    */
  handleChangeHistoryState_(isLastBack, isAMP) {
    if (isLastBack) {
      if (this.hideViewer_) this.hideViewer_();
      return;
    }
    if (isAMP && this.showViewer_ && this.isViewerHidden_ && this.isViewerHidden_()) {
      this.showViewer_();
    }
  }

  /**
   * Place holder message handler. 
   * @param {string} name
   * @param {*} data
   * @param {boolean} rsvp
   * @return {!Promise<*>|undefined}
   * @private
   */
  messageHandler_(name, data, rsvp) {
    log('messageHandler: ', name, data, rsvp);
    switch(name) {
      case 'pushHistory':
        this.history_.pushState(this.ampDocUrl_, data);
        return Promise.resolve();
      case 'popHistory':
        this.history_.goBack();
        return Promise.resolve();
      case 'xhr':
        return this.handleXhr_(data);
      case 'cancelFullOverlay':
      case 'documentLoaded':
      case 'documentHeight':
      case 'prerenderComplete':
      case 'requestFullOverlay':
      case 'scroll':
        return Promise.resolve();
      default:
        return Promise.reject(name + ' Message is not supported!');
    }
  }

  handleXhr_(payload) {
    const originalRequest = payload.originalRequest;
    const init = originalRequest.init;
    const newInit = Object.assign({}, init);
    if (init.headers &&
        init.headers['Content-Type'] &&
        init.headers['Content-Type'].startsWith('multipart/form-data')) {
      const formData = new FormData();
      for (let [fieldName, fieldValues] of Object.entries(init.body)) {
        formData.append(fieldName, fieldValues);
      }
      newInit.body = formData;
    }
    return fetch(originalRequest.input, newInit)
        .then(response => this.serializeResponse_(response))
        .then(serializedResponse => {
          serializedResponse.init.headers['amp-access-control-allow-source-origin'] =
              parseUrl(this.iframe_.src).origin;
          return serializedResponse;
        });
  }

  serializeResponse_(response) {
    return response.text().then(
        text => ({
          body: text,
          init: {
            headers: [...response.headers.keys()].reduce(
                (headers, headerName) => {
                  // The value returned by Headers#get() is automatically
                  // converted to a comma-separated string list if the header
                  // has multiple values, which is the required format when
                  // passing the header as an object literal to constructor of
                  // Response. If the code here is iterating directly on the
                  // header (or Headers#entries()), then multiple header
                  // values corresponding to the same header will be returned in
                  // separate entries, and joining them with comma will have to
                  // be handled manually.
                  headers[headerName] = response.headers.get(headerName);
                  return headers;
                },
                {}),
            status: response.status,
            statusText: response.statusText,
          },
        }));
  }
}
window.Viewer = Viewer;
