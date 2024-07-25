// NOTE: punycode deprecation warning is due to OpenAI API not updated yet:
// https://github.com/openai/openai-node/pull/402

// TODO: use function calling
// https://platform.openai.com/docs/guides/function-calling
// https://www.freecodecamp.org/news/how-to-get-json-back-from-chatgpt-with-function-calling/
// - choose between `getResponse()` and `getResponseFunc()`

// TODO: fine-grained custom screenshot destination
// - update app.config.json structure categories: [ {"code": "...", "dest": "~/Documents/images/"}, { ... } ]

import chokidar from "chokidar";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
// import dotenv from "dotenv";
// import { fileURLToPath } from "node:url";
import async from "async";
import { program } from "commander";
import { yellow } from "kleur/colors";
// import userConfig from "../user.config.json";
import type { Config, JsonResponse, Options } from "./types";
import packageJson from "../package.json";
import { fileURLToPath } from "node:url";

const defaultConfig = {
  categories: {
    code: "the majority of the text is computer code",
    reference: "the image is a photograph",
    web: "the image shows a webpage",
    other: "the image doesn't belong to other categories",
  },
  ollama: {
    baseURL: "http://localhost:11434/v1/",
    model: "llava",
    maxTokens: 30,
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    maxTokens: 30,
  },
};

async function loadConfig(): Promise<Config> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const configPath = path.resolve(__dirname, "../user.config.json");

  try {
    await fs.promises.access(configPath);
    const fileContent = fs.readFileSync(configPath, "utf-8");
    const userConfig = JSON.parse(fileContent);

    // Shallow merge user config with default config
    return Object.assign({}, defaultConfig, userConfig.default);
  } catch (error) {
    if (error instanceof Error) {
      if ("code" in error && error.code === "ENOENT") {
        console.log(
          "User configuration file not found. Using default configuration.",
        );
      } else {
        console.warn("Error loading user configuration:", error.message);
      }
    } else {
      // Non-Error object thrown
      console.warn("An unexpected error occurred:", error);
    }
    return defaultConfig;
  }
}

const userConfig = await loadConfig();

/** User-defined categories. name and description. */
export const categories = userConfig.categories;

/** Explain to ChatGPT how each category should be used */
const categoryPrompt = `Identify the image's category from the following rule: 
${Object.keys(categories).map((cat) => {
  return `If ${categories[cat]}, set it to "${cat}"`;
})}`;

const prompt = `Suggest a short and concise file name in 1-3 words.
If you can identify the software or website being used, add that as part of the new name.
For example, terminal, youtube, photoshop, etc.
Do not include file extension such as .png, .jpg or .txt. Use dash to connect words. 
${categoryPrompt}
Return as structured json in the format { category, filename } and nothing else.`;

program
  .version(packageJson.version)
  .description(
    "Rename and organize Mac screenshots by their contents with the help of AI. This tool watches for any new screenshots, renames it to describe its content, moves it to one of the pre-defined categorical directories.",
  )
  .option(
    "--detail <value>",
    "What image resolution to use for inference",
    "low",
  )
  .option(
    "--provider <value>",
    "Choose supported API provider - openai or ollama",
    "ollama",
  )
  .option("--outdir <folder_path>", "Path to save renamed images to")
  .option("--retroactive", "Process already existing screenshots")
  .option("--watch", "Watch for new screenshots");

program.parse();

const opts: Options = program.opts();

// watch an/or process existing images
if (!opts.watch && !opts.retroactive) {
  console.error("Missing options. Add --watch and/or --retroactive");
  process.exit(1);
}

// check provider
const providerOpt = opts.provider.toLowerCase();
if (providerOpt !== "openai" && providerOpt !== "ollama") {
  console.error(`Selected provider ${providerOpt} is not supported`);
  process.exit(1);
}

// set up API key
// const scriptDir = path.dirname(fileURLToPath(import.meta.url));
// const projectDir = path.dirname(scriptDir);
// dotenv.config({ path: path.join(projectDir, ".env") });

let OPENAI_API_KEY: string | undefined;
if (providerOpt === "openai") {
  OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (OPENAI_API_KEY === undefined) {
    console.error(
      "Error: OPENAI_API_KEY is not provided. Create `.env` file and add the API key.",
    );
    process.exit(1);
  }
}

// set up provider object
const provider = userConfig[providerOpt];

const client = new OpenAI({
  baseURL: provider.baseURL,
  apiKey: providerOpt === "openai" ? OPENAI_API_KEY : "ollama",
});

const watchPath = path.join(os.homedir(), "Desktop");

// set up outDir
const outDir = opts.outdir || path.join(watchPath, "Screenshots");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Created output folder: ${yellow(outDir)}`);
}

for (const category in categories) {
  const categoryDir = path.join(outDir, category);
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
    console.log(`Created folder: ${yellow(categoryDir)}`);
  }
}

const origDir = path.join(outDir, "original");
if (!fs.existsSync(origDir)) {
  fs.mkdirSync(origDir, { recursive: true });
  console.log(`Created folder: ${yellow(origDir)}`);
}

const queue = async.queue((filePath: string, cb) => {
  processFile(filePath)
    .then(() => {
      // let async know the current task is completed
      cb();
    })
    .catch((e) => {
      console.error(`Erro processing file: ${e}`);
      cb(e);
    });
}, 1);

queue.drain(() => {
  console.log("All screenshots have been processed.");
  if (!opts.watch) {
    process.exit(0);
  }
});

// add existing screenshots to the queue
if (opts.retroactive) {
  // first check if there's any existing files to process
  fs.promises.readdir(watchPath).then((files) => {
    const filesToProcess: string[] = [];
    for (const file of files) {
      const filePath = path.join(watchPath, file);
      if (!fs.lstatSync(filePath).isFile()) continue;
      if (!isMacScreenshot(path.basename(filePath))) continue;
      filesToProcess.push(filePath);
    }
    // if there's none, and no watching, exit
    if (filesToProcess.length === 0) {
      if (!opts.watch) {
        console.log(
          "No screenshot was found. Use --watch for continuous monitoring.",
        );
        process.exit(0);
      }
    }
    // if there's some, add to the queue
    for (const filePath of filesToProcess) {
      queue.push(filePath, (e) => {
        e && console.error(e);
      });
    }
  });
}

// listen for file add event on "desktop"
const watcher = chokidar.watch(watchPath, {
  persistent: true,
  ignoreInitial: true,
  depth: 0,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 500,
  },
});

watcher
  .on("add", (filePath) => {
    queue.push(filePath, (e) => {
      e && console.error(e);
    });
  })
  .on("error", (e) => {
    console.error(`Error while watching ${watchPath} ${e}`);
  });

/**
 * Generate a new filename, backup original, rename and move file to new path
 * @param filePath -
 */
async function processFile(filePath: string) {
  const origFilename = path.basename(filePath);

  // see if it is a screenshot (look at filename format)
  if (!isMacScreenshot(origFilename)) return;

  // if screenshot, send it to a provider (ie. openAI, Google or Llava)
  try {
    // get response as JSON object
    const { category, filename } = await getNewName(filePath);

    // add custom date prefix
    const date = getDateFromScreenshot(origFilename);
    const newFilename = `${date}-${filename}${path.extname(filePath)}`;

    const newPath = path.join(
      category && Object.keys(categories).includes(category)
        ? path.join(outDir, category)
        : outDir,
      newFilename,
    );

    // first copy (backup) original image in "originals" folder. play safe.
    await fs.promises.copyFile(
      filePath,
      path.join(origDir, path.basename(filePath)),
    );

    // rename and move file
    await renameFile(filePath, newPath, false);

    // NOTE: if text, OCR transcribe and store the text in metadata?
    //       Mac already offers image search this way?
  } catch (e) {
    console.error(e);
  }
}

const getNewName = async (filePath: string): Promise<JsonResponse> => {
  const origName = path.parse(filePath).name;

  try {
    const imageData = await fs.promises.readFile(filePath, {
      encoding: "base64",
    });
    const base64string = `data:image/png;base64,${imageData}`;

    console.log(
      `Asking ${yellow(`${provider.model} (${providerOpt})`)} to rename ${yellow(origName)}`,
    );
    // https://platform.openai.com/docs/api-reference/chat/create
    const response = await client.chat.completions.create({
      model: provider.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                // Either a URL of the image or the base64 encoded image data.
                url: base64string,
                // https://platform.openai.com/docs/guides/vision/low-or-high-fidelity-image-understanding
                // low detail is good enough to generate filename and more cost-effective
                detail: opts.detail,
              },
            },
          ],
        },
      ],
      max_tokens: provider.maxTokens,
    });

    // check finish reason before parsing the response
    const reason = response.choices[0].finish_reason;
    if (reason !== "stop") {
      console.error(`Model stopped generating: ${reason}`);
      return {
        filename: origName,
      };
    }

    const content = response.choices[0].message.content;
    if (content) {
      // TODO: what if json response has syntax error? (ex. missing curly brace)
      return JSON.parse(content);
    } else {
      return {
        filename: origName,
      };
    }
  } catch (e) {
    console.error(e);
    return {
      filename: origName,
    };
  }
};

/**
 * Rename file (and move if path is different). It doesn't overwrite by default and add number suffix at the end.
 * @param oldPath -
 * @param newFilePath -
 * @param overwrite - Whether to overwrite if file exists at new file path. default: `false`
 */
const renameFile = async (
  oldPath: string,
  newFilePath: string,
  overwrite = false,
) => {
  const newFolderPath = path.dirname(newFilePath);
  const ext = path.extname(newFilePath);
  const baseWithoutExt = path.basename(newFilePath, ext);

  let count = 0;
  // number up if existing file found and not overwriting
  while (fs.existsSync(newFilePath) && !overwrite) {
    count++;
    newFilePath = path.join(newFolderPath, `${baseWithoutExt}-${count}${ext}`);
  }

  try {
    await fs.promises.rename(oldPath, newFilePath);
    console.log(`File renamed to ${yellow(newFilePath)}`);
  } catch (e) {
    console.error(`Error renaming the file: ${e}`);
  }
};

/**
 * Converts the default Mac screenshot filename to YYMMDD format date string.
 * NOTE: Not tested for different formatting system (ex. Asia, Europe)
 * @param filename - Original Mac screenshot filename
 * @returns
 */
const getDateFromScreenshot = (filename: string) => {
  return (filename.match(/(\d{4})-(\d{2})-(\d{2})/) || [])
    .slice(1)
    .reduce((acc, str) => (acc ? `${acc}${str}` : `${str.slice(2)}`), "");
};

/**
 * Check if the file matches the Mac screenshot pattern.
 * NOTE: Not tested for different formatting system (ex. Asia, Europe)
 * @param filename -
 * @returns
 */
const isMacScreenshot = (filename: string) => {
  const screenshotPattern =
    /Screenshot \d{4}-\d{2}-\d{2} at \d{1,2}\.\d{2}\.\d{2}\s(?:AM|PM)\.png/;
  return screenshotPattern.test(filename);
};
