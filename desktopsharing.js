/* global $, config, connection, chrome, alert, getUserMediaWithConstraints, changeLocalVideo, getConferenceHandler */
/**
 * Indicates that desktop stream is currently in use(for toggle purpose).
 * @type {boolean}
 */
var _isUsingScreenStream = false;
/**
 * Indicates that switch stream operation is in progress and prevent from triggering new events.
 * @type {boolean}
 */
var switchInProgress = false;

/**
 * Method used to get screen sharing stream.
 *
 * @type {function (stream_callback, failure_callback}
 */
var obtainDesktopStream = null;

/**
 * Flag used to cache desktop sharing enabled state. Do not use directly as it can be <tt>null</tt>.
 * @type {null|boolean}
 */
var _desktopSharingEnabled = null;

var RTCActivator = null;
/**
 * Method obtains desktop stream from WebRTC 'screen' source.
 * Flag 'chrome://flags/#enable-usermedia-screen-capture' must be enabled.
 */
function obtainWebRTCScreen(streamCallback, failCallback) {
    RTCActivator.getRTCService().getUserMediaWithConstraints(
        ['screen'],
        streamCallback,
        failCallback
    );
}

/**
 * Constructs inline install URL for Chrome desktop streaming extension.
 * The 'chromeExtensionId' must be defined in config.js.
 * @returns {string}
 */
function getWebStoreInstallUrl()
{
    return "https://chrome.google.com/webstore/detail/" + config.chromeExtensionId;
}

/**
 * Checks whether extension update is required.
 * @param minVersion minimal required version
 * @param extVersion current extension version
 * @returns {boolean}
 */
function isUpdateRequired(minVersion, extVersion)
{
    try
    {
        var s1 = minVersion.split('.');
        var s2 = extVersion.split('.');

        var len = Math.max(s1.length, s2.length);
        for (var i = 0; i < len; i++)
        {
            var n1 = 0,
                n2 = 0;

            if (i < s1.length)
                n1 = parseInt(s1[i]);
            if (i < s2.length)
                n2 = parseInt(s2[i]);

            if (isNaN(n1) || isNaN(n2))
            {
                return true;
            }
            else if (n1 !== n2)
            {
                return n1 > n2;
            }
        }

        // will happen if boths version has identical numbers in
        // their components (even if one of them is longer, has more components)
        return false;
    }
    catch (e)
    {
        console.error("Failed to parse extension version", e);
        messageHandler.showError('Error',
            'Error when trying to detect desktopsharing extension.');
        return true;
    }
}


function checkExtInstalled(isInstalledCallback) {
    if (!chrome.runtime) {
        // No API, so no extension for sure
        isInstalledCallback(false);
        return;
    }
    chrome.runtime.sendMessage(
        config.chromeExtensionId,
        { getVersion: true },
        function (response) {
            if (!response || !response.version) {
                // Communication failure - assume that no endpoint exists
                console.warn("Extension not installed?: " + chrome.runtime.lastError);
                isInstalledCallback(false);
            } else {
                // Check installed extension version
                var extVersion = response.version;
                console.log('Extension version is: ' + extVersion);
                var updateRequired = isUpdateRequired(config.minChromeExtVersion, extVersion);
                if (updateRequired) {
                    alert(
                        'Jitsi Desktop Streamer requires update. ' +
                        'Changes will take effect after next Chrome restart.');
                }
                isInstalledCallback(!updateRequired);
            }
        }
    );
}

function doGetStreamFromExtension(streamCallback, failCallback) {
    // Sends 'getStream' msg to the extension. Extension id must be defined in the config.
    chrome.runtime.sendMessage(
        config.chromeExtensionId,
        { getStream: true, sources: config.desktopSharingSources },
        function (response) {
            if (!response) {
                failCallback(chrome.runtime.lastError);
                return;
            }
            console.log("Response from extension: " + response);
            if (response.streamId) {
                RTCActivator.getRTCService().getUserMediaWithConstraints(
                    ['desktop'],
                    function (stream) {
                        streamCallback(stream);
                    },
                    failCallback,
                    null, null, null,
                    response.streamId);
            } else {
                failCallback("Extension failed to get the stream");
            }
        }
    );
}
/**
 * Asks Chrome extension to call chooseDesktopMedia and gets chrome 'desktop' stream for returned stream token.
 */
function obtainScreenFromExtension(streamCallback, failCallback) {
    checkExtInstalled(
        function (isInstalled) {
            if (isInstalled) {
                doGetStreamFromExtension(streamCallback, failCallback);
            } else {
                chrome.webstore.install(
                    getWebStoreInstallUrl(),
                    function (arg) {
                        console.log("Extension installed successfully", arg);
                        // We need to reload the page in order to get the access to chrome.runtime
                        window.location.reload(false);
                    },
                    function (arg) {
                        console.log("Failed to install the extension", arg);
                        failCallback(arg);
                        messageHandler.showError('Error',
                            'Failed to install desktop sharing extension');
                    }
                );
            }
        }
    );
}

/**
 * Initializes <link rel=chrome-webstore-item /> with extension id set in config.js to support inline installs.
 * Host site must be selected as main website of published extension.
 */
function initInlineInstalls()
{
    $("link[rel=chrome-webstore-item]").attr("href", getWebStoreInstallUrl());
}

function getSwitchStreamFailed(error) {
    console.error("Failed to obtain the stream to switch to", error);
    messageHandler.showError('Error', 'Failed to get video stream');
    switchInProgress = false;
}

function streamSwitchDone() {
    //window.setTimeout(
    //    function () {
    switchInProgress = false;
    //    }, 100
    //);
}

function newStreamCreated(stream) {

    var oldStream = RTCActivator.getRTCService().localVideo.getOriginalStream();

    RTCActivator.getRTCService().createLocalStream(stream, "desktop");
    RTCActivator.getRTCService().removeLocalStream(oldStream);

    require("./xmpp/XMPPActivator").switchStreams(stream, oldStream, streamSwitchDone);
}

/**
 * Call this method to toggle desktop sharing feature.
 * @param method pass "ext" to use chrome extension for desktop capture(chrome extension required),
 *        pass "webrtc" to use WebRTC "screen" desktop source('chrome://flags/#enable-usermedia-screen-capture'
 *        must be enabled), pass any other string or nothing in order to disable this feature completely.
 */
function setDesktopSharing(method) {
    // Check if we are running chrome
    if (!navigator.webkitGetUserMedia) {
        obtainDesktopStream = null;
        console.info("Desktop sharing disabled");
    } else if (method == "ext") {
        obtainDesktopStream = obtainScreenFromExtension;
        console.info("Using Chrome extension for desktop sharing");
    } else if (method == "webrtc") {
        obtainDesktopStream = obtainWebRTCScreen;
        console.info("Using Chrome WebRTC for desktop sharing");
    }

    // Reset enabled cache
    _desktopSharingEnabled = null;

    require("./UI/UIActivator").showDesktopSharingButton();
}


module.exports = {
    /*
     * Toggles screen sharing.
     */
    toggleScreenSharing: function () {
        if (switchInProgress || !obtainDesktopStream) {
            console.warn("Switch in progress or no method defined");
            return;
        }
        switchInProgress = true;

        // Only the focus is able to set a shared key.
        if (!_isUsingScreenStream)
        {
            obtainDesktopStream(
                function (stream) {
                    // We now use screen stream
                    _isUsingScreenStream = true;
                    // Hook 'ended' event to restore camera when screen stream stops
                    stream.addEventListener('ended',
                        function (e) {
                            if (!switchInProgress && _isUsingScreenStream) {
                                this.toggleScreenSharing();
                            }
                        }
                    );
                    newStreamCreated(stream);
                },
                getSwitchStreamFailed);
        } else {
            // Disable screen stream
            RTCActivator.getRTCService().getUserMediaWithConstraints(
                ['video'],
                function (stream) {
                    // We are now using camera stream
                    _isUsingScreenStream = false;
                    newStreamCreated(stream);
                },
                getSwitchStreamFailed, config.resolution || '360'
            );
        }
    },
    /**
     * @returns {boolean} <tt>true</tt> if desktop sharing feature is available and enabled.
     */
    isDesktopSharingEnabled: function () {
        if (_desktopSharingEnabled === null) {
            if (obtainDesktopStream === obtainScreenFromExtension) {
                // Parse chrome version
                var userAgent = navigator.userAgent.toLowerCase();
                // We can assume that user agent is chrome, because it's enforced when 'ext' streaming method is set
                var ver = parseInt(userAgent.match(/chrome\/(\d+)\./)[1], 10);
                console.log("Chrome version" + userAgent, ver);
                _desktopSharingEnabled = ver >= 34;
            } else {
                _desktopSharingEnabled = obtainDesktopStream === obtainWebRTCScreen;
            }
        }
        return _desktopSharingEnabled;
    },
    init: function () {
        RTCActivator = require("./RTC/RTCActivator");
        // Set default desktop sharing method
        setDesktopSharing(config.desktopSharing);
        // Initialize Chrome extension inline installs
        if (config.chromeExtensionId) {
            initInlineInstalls();
        }
    },
    isUsingScreenStream: function () {
        return _isUsingScreenStream;
    }
};
