// Modified from: https://github.com/hwchase17/langchainjs/blob/main/langchain/src/tools/bingserpapi.ts

import { Tool, ToolParams } from "langchain/tools";
import { CallbackManagerForToolRun } from "langchain/callbacks";
import { MemoryStore } from "@/lib/intelligence/memory/MemoryStore";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Embeddings } from "langchain/embeddings";

export const NAME = "search";
export const DESCRIPTION = `find answers on the internet and knowledge stores. 
Input format:
{{
  "action": "${ NAME }",
  "action_input": "search query"
}}`;

export interface WebSearchParams extends ToolParams {
    apiKey: string | undefined;
    embeddings: Embeddings;
    memory?: MemoryStore;
    params?: Record<string, string>;
}

export class WebSearch extends Tool {
    public readonly name = NAME;
    public readonly description = DESCRIPTION;

    private readonly embeddings: Embeddings;
    private readonly key: string;
    private readonly memory: MemoryStore;
    private readonly params: Record<string, string>;

    constructor({ apiKey, params, memory, embeddings, verbose, callbacks }: WebSearchParams) {
        super(verbose, callbacks);

        if (!apiKey) {
            throw new Error(
                "BING_API_KEY key not set."
            );
        }

        this.embeddings = embeddings;
        this.key = apiKey;
        this.memory = memory;
        this.params = params;
    }

    /** @ignore */
    async _call(input: string, runManager?: CallbackManagerForToolRun): Promise<string> {
        input = input.replace(/^"(.+(?="$))"$/, '$1');

        const headers = { "Ocp-Apim-Subscription-Key": this.key };
        const params = { q: input, textDecorations: "true", textFormat: "HTML", count: "20" };
        const searchUrl = new URL("https://api.bing.microsoft.com/v7.0/search");

        Object.entries(params).forEach(([ key, value ]) => {
            searchUrl.searchParams.append(key, value);
        });

        const response = await fetch(searchUrl, { headers });

        if (!response.ok) {
            await runManager?.handleToolError(`HTTP error ${ response.status }`);
            throw new Error(`HTTP error ${ response.status }`);
        }

        const res = await response.json();
        const results: { name: string, snippet: string, url: string }[] = res?.webPages ? res.webPages.value : [];

        if (results.length === 0) {
            await runManager?.handleText("No useful results found.");
            return "No useful results found.";
        }

        const links = results.map(result => `[${ result.name }](${ result.url }) - ${ result.snippet }`);

        if (this.memory) {
            const memories = await this.memory.retrieveSnippets(input, 0.75, 4);
            if (memories && memories.length > 0) {  // Check if memories is not null and has at least one element
                const memory = memories[0];
                links.push(`[${memory.metadata.name}](${memory.metadata.url}) - ${memory.pageContent}`);
            }
        }

        // this is short-term memory for searching on the page:
        const vectorStore = await MemoryVectorStore.fromTexts(
            links,
            [],
            this.embeddings
        );
        const similar = await vectorStore.similaritySearch(input, 4);

        return similar.map((res) => res.pageContent).join("\n");
    }
}