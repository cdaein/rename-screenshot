# Rename Mac Screenshots

#cli #ml #ollama #chatgpt

Rename and organize Mac screenshots by their contents with the help of AI. This tool watches for any new screenshots, renames it to describe its content, moves it to one of the pre-defined categorical directories.

The default Mac screenshot file names are not formatted well in my opinion. It does not sort nicely due to mixed use of single and double digits. The date string in the middle is not easy to read. And once you start collecting many, it becomes difficult and cumbersome to find what you need and organize them.

I took inspiration from [Charlie Holtz](https://x.com/charliebholtz/status/1737667912784134344?s=20)'s namedrop project and made my own version to meet my needs.

## How to Install

1. Clone this repo: `git clone https://github.com/cdaein/rename-screenshot.git`
2. Change directory to the repo: `cd rename-screenshot`
3. Install dependency: `npm i`
4. Install as a global package (don't forget the `.`): `npm i -g .`
5. Run with `rename-screenshot` from anywhere.

## How to Use

The program by default watches any new screenshots added to your Desktop. When it detects one, it sends the image to your chosen API provider to get a new filename suggestion. Once the response is received, the screenshot is renamed and moved to the pre-defined directory `~/Desktop/Screenshots`. If there are categories set, it will be moved to a corresponding sub-directory (see Customization for more info). The original screenshot is moved to `Screenshots/original` as a backup. You can review and delete.

To keep watching new screenshots as they come in, add `--watch` option. Otherwise, when the queued images are all processed, the program will exit.

```sh
rename-screenshot --detail <value> \ # What image resolution to use for inference. default: low
                  --outdir <folder_path> \ # Folder to save renamed screenshots to. default: ~/Desktop/Screenshots
                  --provider <api_provider> \ # API provider. either openai or ollama. default: ollama
                  --retroactive \ # Process existing screenshots
                  --watch \ # Continue watch for new screenshots.
                  --help
```

## API Providers

### Ollama (default option)

You can do everything locally on your Mac without sending any data to a third-party. You can test it by turning off the wifi and run the program. Check [Ollama Github repo](https://github.com/ollama/ollama) for installation instructions. It's pretty straight forward and you don't need much technical knowledge. Once you have Ollama installed, download one of the multimodal models that can process image input such as "llava". Open `user.config.json` file and set the model to what you downloaded. The downside of local inference is that depending on your computer, it can be slow and the quality is not as good as closed models.

### OpenAI

You will need to create [an OpenAI API key](https://platform.openai.com/) and pay for usage. Then, create the `.env` file in the project root, and set `OPENAI_API_KEY=your-key`. See `.env.example` file for reference. You can change the model in `user.config.json`. When you use OpenAI API, your data (prompt and image) are sent to their server. Sensitive information such as password, financial data, medical data may be accidently sent if they are part of a screenshot. Also, make sure not to expose your API key on the web.

## Customization

### Datetime Format

I made a few arbitrary choices to meet my needs - for example, how it detects a screenshot image is based on the original file naming. This may be different if your language is not English or if you are using different datetime formatting. You can look at `index.ts` file and change it to meet your needs.

### Category

You can customize `app.config.json` file to add/remove custom categories. When the image content matches one of the category description, it will be moved to a corresponding sub-directory. For example, if you make many screenshots of mathematical forumula or graphs, consider adding the following. The images that meet the condition will be saved to `Screenshots/math/`:

```json
{
  "categories": {
    ...
    "math": "the image has mathmatical notation or graph"
  },
}
```

## Disclaimer

There may be unexpected bugs. Use at your own risk.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
