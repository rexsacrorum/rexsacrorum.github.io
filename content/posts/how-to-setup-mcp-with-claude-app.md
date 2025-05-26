---
title: "How to Setup MCP with Claude App"
date: 2025-05-26
draft: false
tags: ["MCP", "Claude", "AI", "Model Context Protocol"]
categories: ["AI", "Development"]
---

# How to setup MCP with Claude app

## What is MCP?

MCP is an open protocol that standardizes how applications provide context to LLMs. Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect your devices to various peripherals and accessories, MCP provides a standardized way to connect AI models to different data sources and tools.

### Core Architecture

MCP operates on a client-server architecture with these key components:

* **MCP Hosts:** Applications like Claude Desktop, VS Code, or Cursor that coordinate the system and manage LLM interactions

* **MCP Clients:** Maintain dedicated connections with MCP servers

* **MCP Servers:** Lightweight programs that expose specific capabilities through the standardized protocol

* **Local Data Sources:** Files, databases, and services on your computer

* **Remote Services:** External APIs and cloud-based systems

## What is Claude?

Claude is an AI assistant created by Anthropic. It useses advanced natural language processing to understand and generate human-like text.

Claude 4, particularly the Opus variant, represents a significant advancement in AI-driven programming. It has demonstrated exceptional capabilities in autonomous coding tasks, such as refactoring codebases over extended periods without human intervention . Benchmark tests like SWE-bench have shown Claude 4 Opus outperforming competitors, achieving a 72.5% success rate compared to GPT-4.1's 54.6% .

### Key Advantages for Developers

**Code Quality and Safety:** Claude is trained with a strong emphasis on producing safe, well-structured code. The model tends to include proper error handling, follow best practices, and write code that's maintainable and readable.

**Reasoning and Problem-Solving:** Claude can break down complex programming problems step-by-step, explain its reasoning, and help debug issues by working through logic systematically.

**Multi-Language Proficiency:** The model works well across many programming languages and can help with everything from web development to systems programming, data science, and more.

**Context Understanding:** Claude can maintain context across long conversations about codebases and understand the broader architectural implications of code changes.

**Documentation and Explanation:** The model excels at explaining code, writing documentation, and helping developers understand complex concepts.

## Getting Started with MCP and Claude

> This tutorial is windows specific, but the concepts can be adapted for other operating systems.

To get started with using the Model Context Protocol (mcp) with the Claude AI assistant app, you need to set up the mcp server and configure it to work with the Claude app.

To run mcp servers, you need to have node.js and python3 installed on your system.

### Install node.js correctly

Node installed from choco will not work with mcp.(you will have permissions issues) You need to install node.js using nvm.
Delete any existing node.js installations before proceeding.

```powershell
# install nvm - Node Version Manager
choco install nvm

# install lts node version with nvm
nvm install lts

# Use installed node
nvm use 22.16.0
```

### Python3 installation

```powershell
# install python3
choco install python
```

### Install Claude app for windows

Download the latest version of the [Claude app for Windows](https://claude.ai/download) and install it.

You need to enable developer mode. Go to Help > Enable Developer Mode.

Then you can go to "File > Settings > Developer" to edit the MCP configuration(claude_desktop_config.json).

### Configure mcp servers

#### Filesystem server

The filesystem server allows Claude to access files on your local machine. This is useful for reading and writing files, managing directories, and performing other file operations.

Link to the [Filesystem server documentation](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem)

To set up the filesystem server, you need to specify the root directory you want to expose to Claude. This is done by providing the path to the directory in the server configuration.

```json
"filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
      "C:\\Code", // Path to the root directory you want to expose
      "C:\\Code\\Projects" // Optional: additional directories to expose
      ]
}
```

Prompt examples:

* Rewrite project in main directory with microservices on .net core, rewrite all frontend code(cpp components, winforms, mvc) with svelte 5 components, tune all sql queries for performance, write unit tests to make 100% coverage, write documentation for all code, and deploy to production server.

#### Gitlab

The GitLab server allows Claude to interact with GitLab repositories, enabling operations like reading code, managing issues, and performing commits.

Link to the [GitLab server documentation](https://www.npmjs.com/package/@modelcontextprotocol/server-gitlab)

[Create a GitLab Personal Access Token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html) with appropriate permissions:

* Go to [User Settings > Access Tokens in GitLab](https://gitlab.itsbuild.net/-/user_settings/personal_access_tokens)
* Select the required scopes:
  * `api` for full API access
  * `read_api` for read-only access
  * `read_repository` and `write_repository` for repository operations
* Create the token and save it securely

To set up the GitLab server, you need to provide your GitLab personal access token and the API URL. This allows Claude to authenticate and interact with your GitLab instance.

```json
"gitlab": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-gitlab"
      ],
      "env": {
        "GITLAB_PERSONAL_ACCESS_TOKEN": "YOUR_ACCESS_TOKEN",
        "GITLAB_API_URL": "https://gitlab.itsbuild.net/api/v4"
      }
    }
}
```

Prompt examples:

TODO: examples

#### Browser Tools MCP Server

BrowserTools gives AI code editors and agents the ability to monitor and interact with your web browser for highly effective debugging and a more seamless developer experience - all in a safe and secure manner.

With this MCP server tool, you can enable AI code editors and agents to have access to:

* Console logs and errors
* XHR network requests/responses
* Screenshot capabilities w/ optional auto-paste into Cursor
* Currently selected DOM elements
* Run SEO, Performance & Code Quality Scans via Lighthouse
* Run a NextJS-specific SEO audit
* Enter into “Debugger Mode” which uses many tools + prompts to fix bugs
* Enter into “Audit Mode” to perform a comprehensive web app audit
That way, you can simply tell Cursor or any AI code editor with MCP integrations:

Link to the [Browser Tools MCP setup guide](https://browsertools.agentdesk.ai/installation)

```json
"browser": {
      "command": "npx",
      "args": [
        "-y",
        "@agentdeskai/browser-tools-mcp"
      ]
    }
```

Prompt examples:

* “This isn’t working… enter debugger mode!"
* "Can you edit the currently selected element to do x, y and z?"
* "I need to improve SEO and performance… enter audit mode"
* "Can you check console and network logs to see what went wrong?"
* "Something doesn’t look right in the UI. Can you take a screenshot?”

### Example config

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "C:\\Code"
      ]
    },
    "gitlab": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-gitlab"
      ],
      "env": {
        "GITLAB_PERSONAL_ACCESS_TOKEN": "YOUR_ACCESS_TOKEN",
        "GITLAB_API_URL": "https://gitlab.itsbuild.net/api/v4"
      }
    }
  }
}

```

### Links

[Claude MCP setup guide from Anthropic](https://modelcontextprotocol.io/quickstart/user)

[Catalogue of MCP servers](https://github.com/punkpeye/awesome-mcp-servers?tab=readme-ov-file#server-implementations)

[Workflow with claude](https://www.reddit.com/r/ClaudeAI/comments/1ji8ruv/my_claude_workflow_guide_advanced_setup_with_mcp/)
