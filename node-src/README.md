<p align="center">
    <img src="https://raw.githubusercontent.com/HanaokaYuzu/Gemini-API/master/assets/banner.png" width="55%" alt="Gemini Banner" align="center">
</p>
<p align="center">
    <a href="https://github.com/HanaokaYuzu/Gemini-API/blob/master/LICENSE">
        <img src="https://img.shields.io/github/license/HanaokaYuzu/Gemini-API" alt="License"></a>
</p>
<p align="center">
    <a href="https://github.com/HanaokaYuzu/Gemini-API/issues">
        <img src="https://img.shields.io/github/issues/HanaokaYuzu/Gemini-API?style=social&logo=github" alt="GitHub issues"></a>
</p>

# <img src="https://raw.githubusercontent.com/HanaokaYuzu/Gemini-API/master/assets/logo.svg" width="35px" alt="Gemini Icon" /> Gemini-API (Node.js/TypeScript)

An asynchronous Node.js/TypeScript wrapper for the [Google Gemini](https://gemini.google.com) web app (formerly Bard), running in parallel to the original Python implementation.

## Features

- **TypeScript Native** - Fully typed API requests and responses.
- **Persistent Cookies** - Automatically refreshes cookies in the background.
- **Image/Video/Audio Generation** - Supports generating and parsing media files in the response natively.
- **Deep Research** - Autonomous deep research workflow support with plan creation and progress polling.
- **Streaming Mode** - Supports AsyncGenerators to stream responses.
- **Multi-turn Chat** - Manage complex conversations seamlessly with the \`ChatSession\` manager.

## Table of Contents

- [Installation](#installation)
- [Authentication](#authentication)
- [Usage](#usage)
  - [Initialization](#initialization)
  - [Generate Content](#generate-content)
  - [Conversations Across Multiple Turns](#conversations-across-multiple-turns)
  - [Streaming Mode](#streaming-mode)
  - [Deep Research](#deep-research)

## Installation

Ensure you have Node.js 18+ installed.

```sh
npm install
npm run build
```

## Authentication

- Go to <https://gemini.google.com> and log in with your Google account.
- Press F12 to open the web inspector, go to the \`Network\` tab, and refresh the page.
- Click any request to the main document and copy the cookie values of \`__Secure-1PSID\` and \`__Secure-1PSIDTS\`.

## Usage

### Initialization

Import the required modules and initialize a client with your cookies.

```typescript
import { GeminiClient } from './dist/index.js';

const secure1PSID = "YOUR_COOKIE_VALUE_HERE";
const secure1PSIDTS = "YOUR_COOKIE_VALUE_HERE";

async function main() {
    const client = new GeminiClient(secure1PSID, secure1PSIDTS);
    await client.init({ verbose: true });

    console.log("Client Initialized.");
    await client.close();
}

main().catch(console.error);
```

### Generate Content

Ask a single-turn question and retrieve the parsed output.

```typescript
import { GeminiClient } from './dist/index.js';

async function main() {
    const client = new GeminiClient("COOKIE", "COOKIE");
    await client.init();

    const response = await client.generateContent("Hello World!");
    console.log(response.text);

    await client.close();
}

main();
```

### Conversations Across Multiple Turns

Keep the conversation continuous using the \`ChatSession\` manager.

```typescript
import { GeminiClient } from './dist/index.js';

async function main() {
    const client = new GeminiClient("COOKIE", "COOKIE");
    await client.init();

    const chat = client.startChat();

    const res1 = await chat.sendMessage("Hi, I am Bob.");
    console.log(res1.text);

    const res2 = await chat.sendMessage("What is my name?");
    console.log(res2.text);

    await client.close();
}

main();
```

### Streaming Mode

Use AsyncGenerators to retrieve partial characters as they arrive.

```typescript
import { GeminiClient } from './dist/index.js';

async function main() {
    const client = new GeminiClient("COOKIE", "COOKIE");
    await client.init();

    const stream = client.generateContentStream("Write a long poem about the sea.");
    for await (const chunk of stream) {
        process.stdout.write(chunk.textDelta);
    }
    console.log();

    await client.close();
}

main();
```

### Deep Research

Utilize Gemini's autonomous Deep Research workflow.

```typescript
import { GeminiClient } from './dist/index.js';

async function main() {
    const client = new GeminiClient("COOKIE", "COOKIE");
    await client.init();

    console.log("Creating research plan...");
    const plan = await client.createDeepResearchPlan("Latest developments in quantum computing 2025");
    console.log("Plan Title:", plan.title);

    console.log("Starting research...");
    const startOutput = await client.startDeepResearch(plan);

    console.log("Waiting for results...");
    const result = await client.waitForDeepResearch(plan, 10, 600, (status) => {
        console.log(\`Status [\${status.state}]: \${status.title}\`);
    });

    console.log("Final Report:");
    console.log(result.text);

    await client.close();
}

main();
```
