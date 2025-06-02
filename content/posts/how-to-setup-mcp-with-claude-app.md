---
title: "How to Setup MCP with Claude App"
date: 2025-05-26
draft: false
tags: ["MCP", "Claude", "AI", "Model Context Protocol"]
categories: ["AI", "Development"]
---

## What is MCP?

MCP is an open protocol that standardizes how applications provide context to LLMs. Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect your devices to various peripherals and accessories, MCP provides a standardized way to connect AI models to different data sources and tools.

### Core Architecture

**MCP Server**: The component that exposes resources, tools, and prompts to the AI assistant. Servers can provide access to databases, APIs, file systems, or other external services.

**MCP Client**: The AI assistant or application that consumes services from MCP servers. The client initiates connections and makes requests for resources and tools. The Claude app is an MCP client.

## What is Claude?

Claude is an AI assistant created by Anthropic. It utilizes advanced natural language processing to comprehend and produce human-like text.

Claude 4, particularly the Opus variant, represents a significant advancement in AI-driven programming. It has demonstrated exceptional capabilities in autonomous coding tasks, such as refactoring codebases over extended periods without human intervention . Benchmark tests, such as SWE-bench, have shown Claude 4 Opus outperforming competitors, achieving a 72.5% success rate compared to GPT-4.1's 54.6%.

### Key Advantages of using Claude app

For the same anthropic models, Claude Pro subscription provides a bigger context window(200k tokens compared to 36k in Copilot), longer thinking time with more iterations.

It allows you to work on large projects and get better results.

## Getting Started with MCP and Claude

> This tutorial is windows specific, but the concepts can be adapted for other operating systems.

To get started with using the Model Context Protocol (MCP) with the Claude AI assistant app, you need to set up the MCP server and configure it to work with the Claude app.

To run MCP servers, you need to have Node.js and Python installed on your system.

### Install Node.js correctly

Node installed from choco will not work with mcp..(you will have permissions issues) You need to install node.js using nvm. Delete any existing Node.js installations before proceeding.

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

### Install the Claude app for windows

Download the latest version of the [Claude app for Windows](https://claude.ai/download) and install it.

You need to enable developer mode. Go to Help > Enable Developer Mode.

Then you can go to "File > Settings > Developer" to edit the MCP configuration(claude_desktop_config.json).

### Configure mcp servers

#### Filesystem server

The filesystem server allows Claude to access files on your local machine. This is useful for reading and writing files, managing directories, and performing other file operations.

Link to the [Filesystem server documentation](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem)

To set up the filesystem server, you need to specify the root directory you want to expose to Claude. This is done by providing the path to the directory in the server configuration.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "C:\\Code\\"
      ],
      "env": {
        "ALLOWED_DIRECTORIES": "C:\\Code\\"
      }
    }
  }
}
```

Prompt examples:

* Rewrite the project in the main directory with microservices on .NET Core, rewrite all frontend code(Cpp components, WinForms, MVC) with Svelte 5 components, tune all sql queries for performance, write unit tests to make 100% coverage, write documentation for all code, and deploy to the production server.

#### Browser MCP

If you want to automate actions on a website, like repeatedly fill out a form, you normally can't do it with AI apps like Cursor or Claude because they don't have access to a web browser. With Browser MCP, you can connect AI apps to your browser so they can automate tasks on your behalf.

You need to [install Chrome extension](https://chromewebstore.google.com/detail/browser-mcp-automate-your/bjfgambnhccakkhmkepdoekmckoijdlc).

After restarting the Claude app, go to the extension and press "connect this tab".

[Browser MCP docs.](https://docs.browsermcp.io/welcome)

```json
{
  "mcpServers": {
    "browsermcp": {
      "command": "npx",
      "args": ["@browsermcp/mcp@latest"]
    }
  }
}
```

Prompt examples:

* Write an Ansible playbook to automate the dev machine setup according to this guide %YOUR_GUIDE_URL%.

#### Windows CLI MCP Server

MCP server for secure command-line interactions on Windows systems, enabling controlled access to PowerShell, CMD, Git Bash shells, and remote systems via SSH. It allows MCP clients (like Claude Desktop) to perform operations on your system, similar to Open Interpreter.

**Features**

* **Multi-Shell Support**: Execute commands in PowerShell, Command Prompt (CMD), and Git Bash
* **SSH Support**: Execute commands on remote systems via SSH
* **Resource Exposure**: View SSH connections, current directory, and configuration as MCP resources
* **Security Controls**:
  * Command and SSH command blocking (full paths, case variations)
  * Working directory validation
  * Maximum command length limits
  * Command logging and history tracking
  * Smart argument validation
* **Configurable**:
  * Custom security rules
  * Shell-specific settings

Create a `config.json` with the following command and arguments:

```powershell
npx @simonb97/server-win-cli --init-config "$HOME\.win-cli-mcp\config.json"
```

Edit the `config.json` file to customize the server settings, such as allowed commands, SSH configurations, allowed directories, and security rules.

Config:

```json
{
  "mcpServers": {
    "windows-cli": {
      "command": "npx",
      "args": [
        "-y",
        "@simonb97/server-win-cli",
        "--config",
        "$HOME\\.win-cli-mcp\\config.json"
      ]
    }
  }
}
```

Prompt examples:

* TODO:

#### Context7 MCP - Up-to-date Code Docs For Any Prompt

Context7 pulls up-to-date, version-specific documentation and code examples directly from the source. Paste accurate, relevant documentation directly into tools like Cursor, Claude, or any LLM. Get better answers, no hallucinations and an AI that actually understands your stack.

Config:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "env": {
        "DEFAULT_MINIMUM_TOKENS": "6000"
      }
    }
  }
}
```

Prompt examples:
* Create a basic Next.js project with app router. use context7
* Create a script to delete the rows where the city is "" given PostgreSQL credentials. use context7

### Example config

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "C:\\Code\\"
      ],
      "env": {
        "ALLOWED_DIRECTORIES": "C:\\Code\\"
      }
    },
    "browsermcp": {
      "command": "npx",
      "args": ["@browsermcp/mcp@latest"]
    },
    "windows-cli": {
      "command": "npx",
      "args": [
        "-y",
        "@simonb97/server-win-cli",
        "--config",
        "$HOME\\.win-cli-mcp\\config.json"
      ]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "env": {
        "DEFAULT_MINIMUM_TOKENS": "6000"
      }
    }
  }
}
```

### Links

[Claude MCP setup guide from Anthropic](https://modelcontextprotocol.io/quickstart/user)

[Catalogue of MCP servers](https://github.com/punkpeye/awesome-mcp-servers?tab=readme-ov-file#server-implementations)

[Workflow with Claude](https://www.reddit.com/r/ClaudeAI/comments/1ji8ruv/my_claude_workflow_guide_advanced_setup_with_mcp/)
