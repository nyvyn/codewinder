import { CodeExecutor } from "@/lib/intelligence/tools/CodeExecutor";
import { WebSearch } from "@/lib/intelligence/tools/WebSearch";
import { Callbacks } from "langchain/callbacks";
import { WebBrowser } from "@/lib/intelligence/tools/WebBrowser";
import { MemoryStore } from "@/lib/intelligence/memory/MemoryStore";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { ReActExecutor } from "@/lib/intelligence/react/ReActExecutor";
import { Tool } from "langchain/tools";
import { CreativeWriter } from "@/lib/intelligence/tools/CreativeWriter";

export const makeChain = async ({callbacks}: { callbacks: Callbacks }): Promise<ReActExecutor> => {
    const openAiApiKey = process.env.OPENAI_API_KEY;
    if (!Boolean(openAiApiKey)) {
        throw new Error('OpenAI api key not found.');
    }
    const bingApiKey = process.env.BING_API_KEY;

    // const replicateApiKey = process.env.REPLICATE_API_KEY;
    //
    // const predictable = new Replicate({
    //     apiKey: replicateApiKey,
    //     model: "replicate/vicuna-13b:e6d469c2b11008bb0e446c3e9629232f9674581224536851272c54871f84076e",
    //     input: {
    //         temperature: 0.1,
    //         max_length: 4096,
    //     },
    //     callbacks
    // });

    // This is GPT4all with temp of 0
    // const predictable = new OpenAI({
    //     modelName: "wizardLM-7B.q4_2",
    //     temperature: 0,
    //     streaming: Boolean(callbacks),
    //     callbacks,
    //     maxRetries: 2,
    //     verbose: true,
    // }, {
    //     basePath: "http://127.0.0.1:4891/v1",
    // });

    // This should represent intelligence that is great at determiing the best tool to use.
    const predictable = new ChatOpenAI({
        openAIApiKey: openAiApiKey,
        modelName: "gpt-3.5-turbo",
        temperature: 0,
        topP: 0,
        streaming: Boolean(callbacks),
        callbacks,
        maxRetries: 2
    });

    // This should represent intelligence that is great at writing code.
    const powerful = new ChatOpenAI({
        openAIApiKey: openAiApiKey,
        modelName: "gpt-4",
        temperature: 0.5,
        streaming: Boolean(callbacks),
        callbacks,
        maxRetries: 2
    });

    // This should represent intelligence that is creative.
    const creative = new ChatOpenAI({
        openAIApiKey: openAiApiKey,
        temperature: 0.7,
        modelName: "gpt-4",
        streaming: Boolean(callbacks),
        callbacks,
        maxRetries: 2
    });

    const embeddings = new OpenAIEmbeddings({openAIApiKey: openAiApiKey});
    const memory = await MemoryStore.makeDurableStore("memories", embeddings);
    const knowledge = await MemoryStore.makeDurableStore("knowledge", embeddings);
    const code = await MemoryStore.makeDurableStore("code", embeddings);

    const tools: Tool[] = [
        new WebBrowser({callbacks, embeddings, memory: knowledge, model: predictable}),
        new CodeExecutor({callbacks, memory: code, model: powerful}),
        new CreativeWriter({callbacks, model: creative})
    ];
    if (Boolean(bingApiKey)) {
        tools.push(new WebSearch({apiKey: bingApiKey, callbacks, embeddings, memory: knowledge}));
    }

    // The Executor gets all tools including the multistep, since that's a tool that could be returned by the ReActAgent
    // (see ReActAgentOutputParser). However, the ReActAgent itself does not get the multistep, so that it's not selected directly.
    return ReActExecutor.makeExecutor({
        creative,
        memory,
        model: predictable,
        tools
    });
}