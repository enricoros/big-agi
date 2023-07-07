# Local LLM Integration with `text-web-ui` :llama:

Integrate local Large Language Models (LLMs) using `oobabooga/text-generation-webui`, a specialized interface that incorporates a custom variant of the OpenAI API for a seamless integration experience. 

`text-generation-webui` is a versatile tool for implementing and operating Large Language Models.

## Implementation Components

Implementation of local LLMs requires the following components:

### `text-generation-webui`

An interactive Gradio web UI built for running Large Language Models.

### Local Large Language Model

Please follow the guide provided in `text-generation-webui` for this step.

### `big-AGI`

A client for LLM integrations, offering features such as Personas, Code Execution, Voice Support, AGI functions, and more.

## Setup Instructions

This guide presumes that `big-AGI` is already installed on your system. 

1. Install `text-generation-webui`.
2. Go to the following folder `text-generation-webui/extensions/openai`.
3. Run the following command in the terminal: `pip install -r requirements.txt`.
4. Navigate back to the directory containing your start file.
5. Open `webui.py`.
6. Modify `CMD_FLAGS` to: `CMD_FLAGS = '--chat --listen --extensions openai'`.
7. Run the start file in the terminal. You should see `OPENAI_API_BASE=http://0.0.0.0:5001/v1`.
8. Launch `big-AGI`.
9. Navigate to `models>Advanced>API Host` and enter the provided IP address (`http://0.0.0.0` or `http://127.0.0.1`) and port. If the `text-web-ui` server is operating on a different networked computer, change the address from `0.0.0.0` to the server's IP. The format is `IP:Port`.
10. Use `OPENAI_API_KEY=sk-111111111111111111111111111111111111111111111111` for the API key.
    

Experience the privacy and flexibility of local LLM integration with `text-web-ui` and `big-AGI`! :tada:
