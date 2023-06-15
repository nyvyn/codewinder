import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import remarkGfm from "remark-gfm";
import { Message } from "@/lib/types/Message";
import styles from "./MessageList.module.css";

interface MessageListProps {
    chatMessages: Message[];
    loading: boolean;
}

const MessageList = ({ chatMessages, loading }: MessageListProps) => {
    const messageListRef = useRef<HTMLDivElement>(null);
    const hasUserScrolledUp = useRef(false); // New useRef to track if user scrolled up.

    useEffect(() => {
        const messageList = messageListRef.current;
        if (messageList) {
            const handleScroll = () => {
                const atBottom = messageList.scrollTop + messageList.offsetHeight >= messageList.scrollHeight - 150; // from bottom
                hasUserScrolledUp.current = !atBottom;
            };
            messageList.addEventListener('scroll', handleScroll);
            return () => {
                messageList.removeEventListener('scroll', handleScroll);
            };
        }
    }, []);

    useEffect(() => {
        if (!hasUserScrolledUp.current) {
            const messageList = messageListRef.current;
            if (messageList) {
                messageList.scrollTop = messageList.scrollHeight;
            }
        }
    }, [chatMessages, loading]);

    return (
        <div ref={ messageListRef } className={ styles.messagelist }>
            { chatMessages.map((message, index) => {
                let icon;
                let className;

                if (message.type === "apiMessage") {
                    icon = <Image src="/parrot-icon.png" alt="AI" width="30" height="30" className={ styles.boticon }
                                  priority/>;
                    className = styles.apimessage;
                } else {
                    icon = <Image src="/user-icon.png" alt="Me" width="30" height="30" className={ styles.usericon }
                                  priority/>

                    className = loading && index === chatMessages.length - 1
                        ? styles.usermessagewaiting
                        : styles.usermessage;
                }
                return (
                    <div key={ index } className={ className }>
                        { icon }
                        <div className={ styles.markdownanswer }>
                            <ReactMarkdown linkTarget="_blank"
                                           remarkPlugins={ [ remarkGfm ] }>{ message.message }</ReactMarkdown>
                        </div>
                    </div>
                )
            }) }
        </div>
    );
};

export default MessageList;
