import { MemoryStore } from "@/lib/intelligence/memory/MemoryStore";
import { MultistepExecutor } from "@/lib/intelligence/multistep/MultistepExecutor";
import { ReActAgent } from "@/lib/intelligence/react/ReActAgent";
import { ReActExecutor } from "@/lib/intelligence/react/ReActExecutor";
import { CodeEvaluator } from "@/lib/intelligence/tools/CodeEvaluator";
import { CodeWriter } from "@/lib/intelligence/tools/CodeWriter";
import { PlanAndSolve } from "@/lib/intelligence/tools/PlanAndSolve";
import { WebBrowser } from "@/lib/intelligence/tools/WebBrowser";
import { WebSearch } from "@/lib/intelligence/tools/WebSearch";
import { Callbacks } from "langchain/callbacks";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { StructuredTool } from "langchain/tools";

type makeChainOptions = {
    callbacks: Callbacks;
    localKey?: string;
    usePower?: boolean
}

export const makeChain = async ({callbacks, localKey = null, usePower = false}: makeChainOptions): Promise<ReActExecutor> => {
    const openAiApiKey = localKey || process.env.OPENAI_API_KEY;
    if (!Boolean(openAiApiKey)) {
        throw new Error("OpenAI API Key not set.");
    }
    const bingApiKey = process.env.BING_API_KEY;
    // const zapierApiKey = process.env.ZAPIER_NLA_API_KEY;

    const power = "gpt-4-0613";
    const speed = "gpt-3.5-turbo-0613";
    const long = "gpt-3.5-turbo-16k-0613";

    // This should represent intelligence that is great at determiing the best tool to use.
    const predictable = new ChatOpenAI({
        openAIApiKey: openAiApiKey,
        modelName: usePower ? power : speed,
        temperature: 0,
        topP: 0,
        streaming: Boolean(callbacks),
        callbacks,
        maxRetries: 2
    });

    // This should represent intelligence that is great at parsing long texts.
    const capable = new ChatOpenAI({
        openAIApiKey: openAiApiKey,
        modelName: long,
        temperature: 0.1,
        topP: 0,
        streaming: Boolean(callbacks),
        callbacks,
        maxRetries: 2,
        maxTokens: 300
    });

    // This should represent intelligence that is great at writing code.
    const coder = new ChatOpenAI({
        openAIApiKey: openAiApiKey,
        modelName: power,
        temperature: 0.5,
        streaming: Boolean(callbacks),
        callbacks,
        maxRetries: 2
    });

    // This should represent intelligence that is creative.
    const creative = new ChatOpenAI({
        openAIApiKey: openAiApiKey,
        temperature: 0.8,
        modelName: speed,
        streaming: Boolean(callbacks),
        callbacks,
        maxRetries: 2
    });

    const embeddings = new OpenAIEmbeddings({openAIApiKey: openAiApiKey});
    const memories = await MemoryStore.makeDurableStore("memories", embeddings);
    const knowledge = await MemoryStore.makeDurableStore("knowledge", embeddings);
    const code = await MemoryStore.makeDurableStore("code", embeddings);

    const tools: StructuredTool[] = [
        new WebBrowser({callbacks, embeddings, model: capable, store: knowledge}),
        new CodeWriter({callbacks, model: coder}),
        new CodeEvaluator({callbacks, model: coder, store: code}),
    ];
    if (Boolean(bingApiKey)) {
        tools.push(new WebSearch({apiKey: bingApiKey, callbacks, embeddings, store: knowledge}));
    }
    // if (Boolean(zapierApiKey)) {
    //     const zapier = new ZapierNLAWrapper({apiKey: zapierApiKey});
    //     const toolkit = await ZapierToolKit.fromZapierNLAWrapper(zapier);
    //     tools.push(...toolkit.tools);
    // }

    const multistepExecutor = new MultistepExecutor({
        callbacks,
        creative,
        predictable,
        store: memories,
        tools,
        verbose: true,
    })
    const toolkit = [];
    toolkit.push(new PlanAndSolve({callbacks, multistepExecutor, verbose: true}));

    // The effect is that the top level ReAct agent can only choose from the PlanAndSolve tool.
    // The PlanAndSolve tool can choose from any of the other tools except itself.
    const agent = ReActAgent.fromLLMAndTools({
        callbacks,
        model: predictable,
        store: memories,
        tools,
        verbose: true,
    });
    return ReActExecutor.fromAgentAndTools({
        agent,
        callbacks,
        tools,
        verbose: true,
    });
}