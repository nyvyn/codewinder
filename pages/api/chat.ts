// Based on: https://github.com/sullivan-sean/chat-langchainjs/blob/main/pages/api/chat-stream.ts

import { makeChain } from "@/lib/intelligence";
import { CallbackManager } from "langchain/callbacks";
import { NextApiHandler } from "next";
import { CONTEXT_INPUT, OBJECTIVE_INPUT } from "@/lib/intelligence/react/ReActAgent";

const Service: NextApiHandler = async (req, res) => {
    const { context, objective }: { context: [ string, string ][], objective: string } = await req.body;

    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        // Important to set no-transform to avoid compression, which will delay
        // writing response chunks to the client.
        // See https://github.com/vercel/next.js/issues/9965
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
    });

    const sendClear = () => {
        res.write("{clear}");
    }

    const sendData = (data: string) => {
        res.write(data);
    };

    const sendLine = (data?: string) => {
        sendData(`\n\n${ data ? data : '' }`);
    }

    const sendError = (error: string) => {
        res.status(500).write(`\n\n${ error }`);
    }

    const callbacks = CallbackManager.fromHandlers({
        handleLLMStart: () => {
            sendLine();
        },
        handleLLMNewToken: async (token) => {
            sendData(token);
        },
        handleLLMEnd: () => {
            sendLine();
        },
        handleText: (text: string) => {
            sendData(text);
        },
        handleToolStart: () => {
            sendLine();
        },
        handleToolEnd: async () => {
            sendLine();
        },
        handleLLMError: async (error) => {
            sendError(error);
        },
    });

    const chain = await makeChain({ callbacks });

    try {
        let inputs = {};
        inputs[OBJECTIVE_INPUT] = objective;
        inputs[CONTEXT_INPUT] = JSON.stringify(context);

        const completion = await chain.predict(inputs);
        sendClear();
        sendLine(completion);
    } catch (error) {
        sendClear();
        sendError(error)
    } finally {
        res.end();
    }
}

export default Service;