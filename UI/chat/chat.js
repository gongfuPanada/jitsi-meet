/* global $, Util, connection, nickname:true, getVideoSize, getVideoPosition, showToolbar, processReplacements */
var Replacement = require("./Replacement.js");
var dep = {
    "VideoLayout": function(){ return require("../VideoLayout")},
    "Toolbar": function(){return require("../toolbars/Toolbar")},
    "UIActivator": function () {
        return require("../UIActivator");
    }
};
/**
 * Chat related user interface.
 */
var Chat = (function (my) {
    var notificationInterval = false;
    var unreadMessages = 0;

    /**
     * Initializes chat related interface.
     */
    my.init = function () {
        var storedDisplayName = window.localStorage.displayname;
        var nickname = null;
        if (storedDisplayName) {
            dep.UIActivator().getUIService().setNickname(storedDisplayName);
            nickname = storedDisplayName;
            Chat.setChatConversationMode(true);
        }

        $('#nickinput').keydown(function (event) {
            if (event.keyCode === 13) {
                event.preventDefault();
                var val = Util.escapeHtml(this.value);
                this.value = '';
                if (!dep.UIActivator().getUIService().getNickname()) {
                    dep.UIActivator().getUIService().setNickname(val);
                    window.localStorage.displayname = val;
                    //this should be changed
                    dep.UIActivator().getXMPPActivator().addToPresence("displayName", val);
                    Chat.setChatConversationMode(true);

                    return;
                }
            }
        });

        $('#usermsg').keydown(function (event) {
            if (event.keyCode === 13) {
                event.preventDefault();
                var value = this.value;
                $('#usermsg').val('').trigger('autosize.resize');
                this.focus();
                var command = new CommandsProcessor(value);
                if(command.isCommand())
                {
                    command.processCommand();
                }
                else
                {
                    //this should be changed
                    var message = Util.escapeHtml(value);
                    dep.UIActivator().getXMPPActivator().sendMessage(message, dep.UIActivator().getUIService().getNickname());
                }
            }
        });

        var onTextAreaResize = function () {
            resizeChatConversation();
            scrollChatToBottom();
        };
        $('#usermsg').autosize({callback: onTextAreaResize});

        $("#chatspace").bind("shown",
            function () {
                scrollChatToBottom();
                unreadMessages = 0;
                setVisualNotification(false);
            });

        addSmileys();
    };

    /**
     * Appends the given message to the chat conversation.
     */
    my.updateChatConversation = function (from, displayName, message) {
        var divClassName = '';

        if (dep.UIActivator().getXMPPActivator().getMyJID() === from) {
            divClassName = "localuser";
        }
        else {
            divClassName = "remoteuser";

            if (!Chat.isVisible()) {
                unreadMessages++;
                Util.playSoundNotification('chatNotification');
                setVisualNotification(true);
            }
        }

        //replace links and smileys
        var escMessage = Util.escapeHtml(message);
        var escDisplayName = Util.escapeHtml(displayName);
        message = Replacement.processReplacements(escMessage);

        var messageContainer =
            '<div class="chatmessage">'+
                '<img src="../images/chatArrow.svg" class="chatArrow">' +
                '<div class="username ' + divClassName +'">' + escDisplayName + '</div>' +
                '<div class="timestamp">' + getCurrentTime() + '</div>' +
                '<div class="usermessage">' + message + '</div>' +
            '</div>';

        $('#chatconversation').append(messageContainer);
        $('#chatconversation').animate(
                { scrollTop: $('#chatconversation')[0].scrollHeight}, 1000);
    };

    /**
     * Appends error message to the conversation
     * @param errorMessage the received error message.
     * @param originalText the original message.
     */
    my.chatAddError = function(errorMessage, originalText)
    {
        errorMessage = Util.escapeHtml(errorMessage);
        originalText = Util.escapeHtml(originalText);

        $('#chatconversation').append('<div class="errorMessage"><b>Error: </b>'
            + 'Your message' + (originalText? (' \"'+ originalText + '\"') : "")
            + ' was not sent.' + (errorMessage? (' Reason: ' + errorMessage) : '')
            +  '</div>');
        $('#chatconversation').animate(
            { scrollTop: $('#chatconversation')[0].scrollHeight}, 1000);
    };

    /**
     * Sets the subject to the UI
     * @param subject the subject
     */
    my.chatSetSubject = function(subject)
    {
        if(subject)
            subject = subject.trim();
        $('#subject').html(Replacement.linkify(Util.escapeHtml(subject)));
        if(subject == "")
        {
            $("#subject").css({display: "none"});
        }
        else
        {
            $("#subject").css({display: "block"});
        }
    };

    /**
     * Opens / closes the chat area.
     */
    my.toggleChat = function () {

        var chatspace = $('#chatspace');

        var chatSize = (chatspace.is(":visible")) ? [0, 0] : Chat.getChatSize();
        dep.VideoLayout().resizeVideoSpace(chatspace, chatSize, chatspace.is(":visible"));

// Check in master
        // Request the focus in the nickname field or the chat input field.
        if ($('#nickname').css('visibility') === 'visible') {
            $('#nickinput').focus();
        } else {
            $('#usermsg').focus();
        }
    };

    /**
     * Sets the chat conversation mode.
     */
    my.setChatConversationMode = function (isConversationMode) {
        if (isConversationMode) {
            $('#nickname').css({visibility: 'hidden'});
            $('#chatconversation').css({visibility: 'visible'});
            $('#usermsg').css({visibility: 'visible'});
            $('#smileysarea').css({visibility: 'visible'});
            $('#usermsg').focus();
        }
    };

    /**
     * Resizes the chat area.
     */
    my.resizeChat = function () {
        var chatSize = Chat.getChatSize();

        $('#chatspace').width(chatSize[0]);
        $('#chatspace').height(chatSize[1]);

        resizeChatConversation();
    };

    /**
     * Returns the size of the chat.
     */
    my.getChatSize = function () {
        var availableHeight = window.innerHeight;
        var availableWidth = window.innerWidth;

        var chatWidth = 200;
        if (availableWidth * 0.2 < 200)
            chatWidth = availableWidth * 0.2;

        return [chatWidth, availableHeight];
    };

    /**
     * Indicates if the chat is currently visible.
     */
    my.isVisible = function () {
        return $('#chatspace').is(":visible");
    };
    /**
     * Shows and hides the window with the smileys
     */
    my.toggleSmileys = function() {
        var smileys = $('#smileysContainer');
        if(!smileys.is(':visible')) {
            smileys.show("slide", { direction: "down", duration: 300});
        } else {
            smileys.hide("slide", { direction: "down", duration: 300});
        }
        $('#usermsg').focus();
    };

    /**
     * Adds the smileys container to the chat
     */
    function addSmileys() {
        var smileysContainer = document.createElement('div');
        smileysContainer.id = 'smileysContainer';
        function addClickFunction(smiley, number) {
            smiley.onclick = function addSmileyToMessage() {
                var usermsg = $('#usermsg');
                var message = usermsg.val();
                message += smileys['smiley' + number];
                usermsg.val(message);
                usermsg.get(0).setSelectionRange(message.length, message.length);
                Chat.toggleSmileys();
                usermsg.focus();
            };
        }
        for(var i = 1; i <= 21; i++) {
            var smileyContainer = document.createElement('div');
            smileyContainer.id = 'smiley' + i;
            smileyContainer.className = 'smileyContainer';
            var smiley = document.createElement('img');
            smiley.src = 'images/smileys/smiley' + i + '.svg';
            smiley.className =  'smiley';
            addClickFunction(smiley, i);
            smileyContainer.appendChild(smiley);
            smileysContainer.appendChild(smileyContainer);
        }

        $("#chatspace").append(smileysContainer);
    }

    /**
     * Resizes the chat conversation.
     */
    function resizeChatConversation() {
        var msgareaHeight = $('#usermsg').outerHeight();
        var chatspace = $('#chatspace');
        var width = chatspace.width();
        var chat = $('#chatconversation');
        var smileys = $('#smileysarea');

        smileys.height(msgareaHeight);
        $("#smileys").css('bottom', (msgareaHeight - 26) / 2);
        $('#smileysContainer').css('bottom', msgareaHeight);
        chat.width(width - 10);
        chat.height(window.innerHeight - 15 - msgareaHeight);
    }

    /**
     * Shows/hides a visual notification, indicating that a message has arrived.
     */
    function setVisualNotification(show) {
        var unreadMsgElement = document.getElementById('unreadMessages');
        var unreadMsgBottomElement = document.getElementById('bottomUnreadMessages');

        var glower = $('#chatButton');
        var bottomGlower = $('#chatBottomButton');

        if (unreadMessages) {
            unreadMsgElement.innerHTML = unreadMessages.toString();
            unreadMsgBottomElement.innerHTML = unreadMessages.toString();

            dep.Toolbar().dockToolbar(true);

            var chatButtonElement
                = document.getElementById('chatButton').parentNode;
            var leftIndent = (Util.getTextWidth(chatButtonElement) -
                Util.getTextWidth(unreadMsgElement)) / 2;
            var topIndent = (Util.getTextHeight(chatButtonElement) -
                Util.getTextHeight(unreadMsgElement)) / 2 - 3;

            unreadMsgElement.setAttribute(
                'style',
                    'top:' + topIndent +
                    '; left:' + leftIndent + ';');

            var chatBottomButtonElement
                = document.getElementById('chatBottomButton').parentNode;
            var bottomLeftIndent = (Util.getTextWidth(chatBottomButtonElement) -
                Util.getTextWidth(unreadMsgBottomElement)) / 2;
            var bottomTopIndent = (Util.getTextHeight(chatBottomButtonElement) -
                Util.getTextHeight(unreadMsgBottomElement)) / 2 - 2;

            unreadMsgBottomElement.setAttribute(
                'style',
                    'top:' + bottomTopIndent +
                    '; left:' + bottomLeftIndent + ';');


            if (!glower.hasClass('icon-chat-simple')) {
                glower.removeClass('icon-chat');
                glower.addClass('icon-chat-simple');
            }
        }
        else {
            unreadMsgElement.innerHTML = '';
            unreadMsgBottomElement.innerHTML = '';
            glower.removeClass('icon-chat-simple');
            glower.addClass('icon-chat');
        }

        if (show && !notificationInterval) {
            notificationInterval = window.setInterval(function () {
                glower.toggleClass('active');
                bottomGlower.toggleClass('active glowing');
            }, 800);
        }
        else if (!show && notificationInterval) {
            window.clearInterval(notificationInterval);
            notificationInterval = false;
            glower.removeClass('active');
            bottomGlower.removeClass('glowing');
            bottomGlower.addClass('active');
        }
    }

    /**
     * Scrolls chat to the bottom.
     */
    function scrollChatToBottom() {
        setTimeout(function () {
            $('#chatconversation').scrollTop(
                    $('#chatconversation')[0].scrollHeight);
        }, 5);
    }

    /**
     * Returns the current time in the format it is shown to the user
     * @returns {string}
     */
    function getCurrentTime() {
        var now     = new Date();
        var hour    = now.getHours();
        var minute  = now.getMinutes();
        var second  = now.getSeconds();
        if(hour.toString().length === 1) {
            hour = '0'+hour;
        }
        if(minute.toString().length === 1) {
            minute = '0'+minute;
        }
        if(second.toString().length === 1) {
            second = '0'+second;
        }
        return hour+':'+minute+':'+second;
    }

    return my;
}(Chat || {}));

module.exports = Chat;
