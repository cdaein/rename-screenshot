import chokidar from 'chokidar';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import OpenAI from 'openai';
import async from 'async';
import { program } from 'commander';
import { yellow } from 'kleur/colors';

// src/index.ts

// user.config.json
var user_config_default = {
  categories: {
    code: "the majority of the text is computer code",
    reference: "the image is a photograph",
    text: "the image is text-heavy paragraph(s)",
    web: "the image shows a webpage",
    youtube: "the image has youtube interface",
    other: "the image doesn't belong to other categories"
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    maxTokens: 30
  },
  ollama: {
    baseURL: "http://localhost:11434/v1/",
    model: "llava",
    maxTokens: 30
  }
};

// package.json
var package_default = {
  name: "rename-screenshot",
  version: "0.1.0",
  main: "index.js",
  type: "module",
  bin: {
    "rename-screenshot": "bin/rename-screenshot.js"
  },
  scripts: {
    watch: "tsup --watch",
    build: "tsc --noemit && tsup ./src/index.ts"
  },
  keywords: [
    "llm",
    "multimodal",
    "nodejs"
  ],
  author: "Daeinc",
  description: "",
  devDependencies: {
    "@types/async": "^3.2.24",
    "@types/node": "^20.14.11",
    tsup: "^8.2.2",
    typescript: "^5.5.3"
  },
  dependencies: {
    async: "^3.2.5",
    chokidar: "^3.6.0",
    commander: "^12.1.0",
    dotenv: "^16.4.5",
    kleur: "^4.1.5",
    openai: "^4.52.7"
  }
};

// src/index.ts
var categories = user_config_default.categories;
var categoryPrompt = `Identify the image's category from the following rule: 
${Object.keys(categories).map((cat) => {
  return `If ${categories[cat]}, set it to "${cat}"`;
})}`;
var prompt = `Suggest a short file name in 1-3 words.
If you can identify the software or website being used, add that as part of the new name.
For example, terminal, youtube, photoshop, etc.
Do not include file extension such as png, jpg or txt. Use dash to connect words. 
${categoryPrompt}
Return as structured json in the format { category, filename } and nothing else.`;
program.version(package_default.version).description(
  "Rename and organize Mac screenshots by their contents with the help of AI. This tool watches for any new screenshots, renames it to describe its content, moves it to one of the pre-defined categorical directories."
).option(
  "--detail <value>",
  "What image resolution to use for inference",
  "low"
).option(
  "--provider <value>",
  "Choose supported API provider - openai or ollama",
  "ollama"
).option("--outdir <folder_path>", "Path to save renamed images to").option("--retroactive", "Process already existing screenshots").option("--watch", "Watch for new screenshots");
program.parse();
var opts = program.opts();
if (!opts.watch && !opts.retroactive) {
  console.error("Missing options. Add --watch and/or --retroactive");
  process.exit(1);
}
var providerOpt = opts.provider.toLowerCase();
if (providerOpt !== "openai" && providerOpt !== "ollama") {
  console.error(`Selected provider ${providerOpt} is not supported`);
  process.exit(1);
}
var OPENAI_API_KEY;
if (providerOpt === "openai") {
  OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (OPENAI_API_KEY === void 0) {
    console.error(
      "Error: OPENAI_API_KEY is not provided. Create `.env` file and add the API key."
    );
    process.exit(1);
  }
}
var provider = user_config_default[providerOpt];
var client = new OpenAI({
  baseURL: provider.baseURL,
  apiKey: providerOpt === "openai" ? OPENAI_API_KEY : "ollama"
});
var watchPath = path.join(os.homedir(), "Desktop");
var outDir = opts.outdir || path.join(watchPath, "Screenshots");
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
var origDir = path.join(outDir, "original");
if (!fs.existsSync(origDir)) {
  fs.mkdirSync(origDir, { recursive: true });
  console.log(`Created folder: ${yellow(origDir)}`);
}
var queue = async.queue((filePath, cb) => {
  processFile(filePath).then(() => {
    cb();
  }).catch((e) => {
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
if (opts.retroactive) {
  fs.promises.readdir(watchPath).then((files) => {
    const filesToProcess = [];
    for (const file of files) {
      const filePath = path.join(watchPath, file);
      if (!fs.lstatSync(filePath).isFile()) continue;
      if (!isMacScreenshot(path.basename(filePath))) continue;
      filesToProcess.push(filePath);
    }
    if (filesToProcess.length === 0) {
      if (!opts.watch) {
        console.log(
          "No screenshot was found. Use --watch for continuous monitoring."
        );
        process.exit(0);
      }
    }
    for (const filePath of filesToProcess) {
      queue.push(filePath, (e) => {
        e && console.error(e);
      });
    }
  });
}
var watcher = chokidar.watch(watchPath, {
  persistent: true,
  ignoreInitial: true,
  depth: 0,
  awaitWriteFinish: {
    stabilityThreshold: 2e3,
    pollInterval: 500
  }
});
watcher.on("add", (filePath) => {
  queue.push(filePath, (e) => {
    e && console.error(e);
  });
}).on("error", (e) => {
  console.error(`Error while watching ${watchPath} ${e}`);
});
async function processFile(filePath) {
  const origFilename = path.basename(filePath);
  if (!isMacScreenshot(origFilename)) return;
  try {
    const { category, filename } = await getNewName(filePath);
    const date = getDateFromScreenshot(origFilename);
    const newFilename = `${date}-${filename}${path.extname(filePath)}`;
    const newPath = path.join(
      category && Object.keys(categories).includes(category) ? path.join(outDir, category) : outDir,
      newFilename
    );
    await fs.promises.copyFile(
      filePath,
      path.join(origDir, path.basename(filePath))
    );
    await renameFile(filePath, newPath, false);
  } catch (e) {
    console.error(e);
  }
}
var getNewName = async (filePath) => {
  const origName = path.parse(filePath).name;
  try {
    const imageData = await fs.promises.readFile(filePath, {
      encoding: "base64"
    });
    const base64string = `data:image/png;base64,${imageData}`;
    console.log(
      `Asking ${yellow(`${provider.model} (${providerOpt})`)} to rename ${yellow(origName)}`
    );
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
                detail: opts.detail
              }
            }
          ]
        }
      ],
      max_tokens: provider.maxTokens
    });
    const reason = response.choices[0].finish_reason;
    if (reason !== "stop") {
      console.error(`Model stopped generating: ${reason}`);
      return {
        filename: origName
      };
    }
    const content = response.choices[0].message.content;
    if (content) {
      return JSON.parse(content);
    } else {
      return {
        filename: origName
      };
    }
  } catch (e) {
    console.error(e);
    return {
      filename: origName
    };
  }
};
var renameFile = async (oldPath, newFilePath, overwrite = false) => {
  const newFolderPath = path.dirname(newFilePath);
  const ext = path.extname(newFilePath);
  const baseWithoutExt = path.basename(newFilePath, ext);
  let count = 0;
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
var getDateFromScreenshot = (filename) => {
  return (filename.match(/(\d{4})-(\d{2})-(\d{2})/) || []).slice(1).reduce((acc, str) => acc ? `${acc}${str}` : `${str.slice(2)}`, "");
};
var isMacScreenshot = (filename) => {
  const screenshotPattern = /Screenshot \d{4}-\d{2}-\d{2} at \d{1,2}\.\d{2}\.\d{2}\s(?:AM|PM)\.png/;
  return screenshotPattern.test(filename);
};

export { categories };
