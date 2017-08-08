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

import {constructViewerCacheUrl} from './amp-url-creator';
import {paramsToString} from './amp-url-creator';
import {ViewerMessaging} from './viewer-messaging';
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
  }

  /**
   * @param {!Function} showViewer method that shows the viewer.
   * @param {!Function} hideViewer method that hides the viewer.
   * @param {!Function():boolean} isViewerHidden method that determines if viewer is hidden.
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
    this.iframe_.setAttribute('sandbox', 'allow-scripts');
    // TODO (chenshay): iframe_.setAttribute('scrolling', 'no')
    // to enable the scrolling workarounds for iOS.

    this.buildIframeSrc_().then(ampDocCachedUrl => {
      this.viewerMessaging_ = new ViewerMessaging(
        window,
        this.iframe_,
        "null" /* frameOrigin */,
        this.messageHandler_.bind(this));

      this.viewerMessaging_.start(true /* opt_isHandshakePoll */).then(()=>{
        log('this.viewerMessaging_.start() Promise resolved !!!');
      });

      this.iframe_.name = `__AMP__${paramsToString(this.createInitParams_())}`;
      this.iframe_.srcdoc = `
<!doctype html>
<html amp>
 <head>
   <meta charset="utf-8">
   <link rel="canonical" href="hello-world.html">
   <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
   <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
   <script async src="https://cdn.ampproject.org/v0/amp-viewer-integration-0.1.js"></script>
   <script async src="https://cdn.ampproject.org/v0.js"></script>
 </head>
 <body>Hello World!</body>
</html>
      `;
      //this.iframe_.removeAttribute('srcdoc');
      //this.iframe_.src = ampDocCachedUrl;
      this.hostElement_.appendChild(this.iframe_);
    });
  }

  /**
   * @return {!Promise<string>}
   */
  buildIframeSrc_() {
    return new Promise(resolve => {
      constructViewerCacheUrl(this.ampDocUrl_, this.createInitParams_()).then(
        viewerCacheUrl => {
          resolve(viewerCacheUrl);
        }
      );
    });
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
      'cap': 'handshakepoll',
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
      case 'popHistory':
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
}
window.Viewer = Viewer;
