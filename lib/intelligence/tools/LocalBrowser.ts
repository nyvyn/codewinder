// Modified from: https://github.com/mayt/BrowserGPT/blob/master/index.js

import cheerio from "cheerio";
import { Tool, ToolParams } from "langchain/tools";
import { BaseLanguageModel } from "langchain/base_language";
import { chromium } from "playwright";
import {
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate
} from "langchain/prompts";
import { GuardChain } from "@/lib/intelligence/chains/GuardChain";

const AsyncFunction = async function () {
}.constructor;

const tagsToLog = [
    'a',
    'p',
    'span',
    'div',
    'button',
    'label',
    'input',
    'textarea',
    'select',
    'option',
    'table',
    'td',
    'th',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
];

const alwaysLog = [ 'a', 'input', 'button', 'li' ];

function getStructure($, reducedText = false) {
    const res = [];
    let indention = 0;

    function write(str) {
        res.push('-'.repeat(indention) + str);
    }

    function dfs(node) {
        let nodeModifier = '';
        const idStr = $(node).attr('id') ? `#${ $(node).attr('id') }` : '';
        if (idStr) {
            nodeModifier += idStr;
        }
        const attrValue = $(node).attr('value');
        if (attrValue) {
            nodeModifier += `[value="${ attrValue }"]`;
        }
        const attrName = $(node).attr('name');
        if (attrName) {
            nodeModifier += `[name="${ attrName }"]`;
        }
        if (tagsToLog.includes(node.rawTagName)) {
            if (nodeModifier || alwaysLog.includes(node.tagName)) {
                write(`${node.rawTagName}${nodeModifier}`);
            }
        }

        const tagName = node.tagName.toLowerCase();

        write(`${ tagName }${ nodeModifier }`);

        indention++;
        $(node).contents().each((_, childNode) => {
            if (childNode.type === 'tag') {
                dfs(childNode);
            } else if (childNode.type === 'text') {
                const trimmedText = $(childNode).text().trim();
                if (trimmedText) {
                    if (reducedText) {
                        if (alwaysLog.includes(tagName)) {
                            write(trimmedText);
                        }
                    } else {
                        write(trimmedText);
                    }
                }
            }
        });
        indention--;
    }

    dfs($('body')[0]);
    return res.join('\n');
}

const modelSiteTokenLimit = {
    'gpt-4': 7000, // official limit 8096,
    'gpt-4-32k': 31000, // official limit 32768,
    'gpt-3.5-turbo': 3000, // official limit 4097,
};

async function parseSite(page, options: {model?: string} = {}) {
    const html = await (await page.locator('body', { timeout: 1000 })).innerHTML();

    const $ = cheerio.load(html, {
        xmlMode: false, // disable XML mode for parsing HTML
    });

    const blockTextElements = {
        script: false,
        noscript: false,
        style: false,
        pre: true, // keep text content when parsing
    };

    // Process blockTextElements
    for (const element in blockTextElements) {
        $(element).each((index, el) => {
            if (!blockTextElements[element]) {
                $(el).remove();
            }
        });
    }

    let structure = getStructure($);

    // bad token count guess
    let tokenLimit = modelSiteTokenLimit[options.model || 'gpt-3.5-turbo'] || Infinity;
    if (structure.length / 4 < tokenLimit) {
        return structure;
    }
    // shorten down the text and try again
    structure = getStructure($, true);
    if (structure.length / 4 < tokenLimit) {
        console.log('Site too large, using chunking down the text body');
        return structure;
    }

    // giving up on the site body
    console.log('Site too large, dropping the site content');
    return '';
}

async function doAction(model, page, task, options = {}) {
    const website = await page.evaluate(() => document.location.href);
    const parsed = await parseSite(page, options);

    const system = `
You are a programmer and your job is to write code. You are working on a playwright file. You will write the commands necessary to execute the given input. 

Context:
Your computer is a mac. Cmd is the meta key, META.
You are on this page: ${ website }

Here is the overview of the site:
${ parsed }

Your output should just be the code that is valid for PlayWright page api.
When given the option to use a timeout option, use 1s. Except when using page.goto() use 10s. 
For actions like click, use the force option to click on hidden elements.

User: click on show hn link
Assistant:
\`\`\`
    const articleByText = 'Show HN';
    await page.getByText(articleByText, {{ exact: true }}).click(articleByText, {{ force: true, hidden: true }});
\`\`\`

Note: if you are already on the correct page, you do not need to go to it again.
`;
    let code = '';
    try {
        const messages = [
            SystemMessagePromptTemplate.fromTemplate(system),
            HumanMessagePromptTemplate.fromTemplate(task)
        ];
        const llmChain = new GuardChain({
            prompt: ChatPromptTemplate.fromPromptMessages(messages),
            llm: model
        });
        const completion = await llmChain.predict({})
        console.log('Commands to be executed');

        try {
            const codeRegex = /```(.*)(\r\n|\r|\n)(?<code>[\w\W\n]+)(\r\n|\r|\n)```/;
            code = completion.match(codeRegex).groups.code.trim();

            console.log(code);
        } catch (e) {
            console.log('No code found');
        }
    } catch (e) {
        return `Error: ${ e.message }`;
    }
    try {
        const func = AsyncFunction('page', code);
        await func(page);

        return parseSite(page);
    } catch (e) {
        return `Error: ${ e.message }`;
    }
}

export const NAME = "local-browser";
export const DESCRIPTION = `finding or summarizing webpage content from a provided url.
Input should be "ONE valid http URL including protocol","action to take on page".
The tool input should use this format:
{{
  "action": "tool name",
  "action_input": ["https://www.google.com","click on the search button"]
}}`;

interface LocalBrowserParams extends ToolParams {
    model: BaseLanguageModel;
}

export class LocalBrowser extends Tool {
    public readonly name = NAME;
    public readonly description = DESCRIPTION;

    private readonly model: BaseLanguageModel;

    constructor({ model, verbose, callbacks }: LocalBrowserParams) {
        super(verbose, callbacks);

        this.model = model;
    }

    /** @ignore */
    async _call(inputs: string): Promise<string> {
        const [ url, action ] = inputs.split(",").map((input) => {
            let t = input.trim();
            t = t.startsWith('[') ? t.slice(1) : t;
            t = t.startsWith('"') ? t.slice(1) : t;
            t = t.endsWith("]") ? t.slice(0, -1) : t;
            t = t.endsWith('"') ? t.slice(0, -1) : t;
            // it likes to put / at the end of urls, won't matter for task
            t = t.endsWith("/") ? t.slice(0, -1) : t;
            return t.trim();
        });
        const browser = await chromium.launch({headless: false});
        const browserContext = await browser.newContext();
        const page = await browserContext.newPage();
        await page.goto(url);

        return await doAction(this.model, page, action);
    }
}
