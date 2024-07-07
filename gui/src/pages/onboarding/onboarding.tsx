import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { greenButtonColor } from "../../components";
import { postToIde } from "../../util/ide";
import { setLocalStorage } from "../../util/localStorage";
import { Div, StyledButton } from "./components";

enum ModelType {
  PearAI,
  Cloud,
  Local,
  Custom // your own models
}

function Onboarding() {
  const [hovered, setHovered] = useState(-1);
  const [selected, setSelected] = useState(-1);

  const navigate = useNavigate();
  const handleNavigate = (selectedModel: ModelType) => {
    switch (selectedModel) {
      case ModelType.PearAI:
        navigate("/modelconfig/pearaiserver");
        break;
      case ModelType.Cloud:
        navigate("/models");
        break;
      case ModelType.Local:
        navigate("/localOnboarding");
        break;
      case ModelType.Custom:
        // Only needed when we switch from the default (local) embeddings provider
        postToIde("index/forceReIndex", undefined);
        // Don't show the tutorial above yet because there's another step to complete at /localOnboarding
        postToIde("showTutorial", undefined);
        navigate("/");
        break;
      default:
        break;
    }
  };

  return (
    <div className="p-2 max-w-96 mt-10 mx-auto">
      <h1 className="text-center">Welcome to PearAI</h1>
      <p className="text-center pb-2">
        Let's find the setup that works best for you
      </p>

      <br></br>
      <Div
        color={"#be1b55"}
        disabled={false}
        selected={selected === ModelType.PearAI}
        hovered={hovered === ModelType.PearAI}
        onClick={() => {
          setSelected(ModelType.PearAI);
        }}
        onMouseEnter={() => setHovered(ModelType.PearAI)}
        onMouseLeave={() => setHovered(-1)}
      >
        <div className="flex items-center">
          <img src={`${window.vscMediaUrl}/logos/pearai-color.png`} className="mr-1" height="24px"></img>
          <h3>PearAI Server</h3>
        </div>
        <p className="mt-0">
          This is the best experience. PearAI will use the strongest available
          commercial models to index code and answer questions. 
        </p>
        <p className="mt-0">
          Code is not stored, and only passes through our server to the model provider.
        </p>
      </Div>
      <br></br>
      <Div
        color={"#be841b"}
        disabled={false}
        selected={selected === ModelType.Cloud}
        hovered={hovered === ModelType.Cloud} 
        onClick={() => {
          setSelected(ModelType.Cloud);
        }}
        onMouseEnter={() => setHovered(ModelType.Cloud)}
        onMouseLeave={() => setHovered(-1)}
      >
        <h3>✨ Cloud models</h3>
        <p>
          Choose between different commercial models available and use your own API key. Code is only ever stored locally.
        </p>
      </Div>
      {selected === ModelType.Cloud && (
        <p className="px-3">
          <b>Embeddings:</b> Voyage Code 2
          <br />
          <br />
          <b>Autocomplete:</b> Starcoder 7b via Fireworks AI (free trial)
          <br />
          <br />
          <b>Chat:</b> GPT-4, Claude 3, and others (free trial)
        </p>
      )}
      <br></br>
      <Div
        color={greenButtonColor}
        disabled={false}
        selected={selected === ModelType.Local}
        hovered={hovered === ModelType.Local}
        onClick={() => {
          setSelected(ModelType.Local);
        }}
        onMouseEnter={() => setHovered(ModelType.Local)}
        onMouseLeave={() => setHovered(-1)}
      >
        <h3>🔒 Local models</h3>
        <p>
          No code will leave your computer, but less powerful models are used.
          Works with Ollama, LM Studio and others.
        </p>
      </Div>
      {selected === ModelType.Local && (
        <p className="px-3">
          <b>Embeddings:</b> Local sentence-transformers model
          <br />
          <br />
          <b>Autocomplete:</b> Starcoder2 3b (set up with Ollama, LM Studio,
          etc.)
          <br />
          <br />
          <b>Chat:</b> Llama 3 with Ollama, LM Studio, etc.
        </p>
      )}
      <br></br>
      {/* <p>
        <a href="https://trypear.ai/customization/overview">
          Read the docs
        </a>{" "}
        to learn more and fully customize Continue by opening config.json.
      </p> */}
      <Div
        color={"#1b84be"}
        disabled={false}
        selected={selected === ModelType.Custom}
        hovered={hovered === ModelType.Custom}
        onMouseEnter={() => setHovered(ModelType.Custom)}
        onMouseLeave={() => setHovered(-1)}
        onClick={() => {
          setSelected(ModelType.Custom);
          postToIde("openConfigJson", undefined);
        }}
      >
        <h3>⚙️ Your own models</h3>
        <p>
          PearAI lets you use your own API key or self-hosted LLMs.{" "}
          <a href="https://trypear.ai/customization/overview">
            Read the docs
          </a>{" "}
          to learn more about using config.json to customize PearAI. This can
          always be done later.
        </p>
      </Div>
      {selected === ModelType.Custom && (
        <p className="px-3">
          Use <code>config.json</code> to configure your own{" "}
          <a href="https://trypear.ai/model-setup/overview">models</a>,{" "}
          <a href="https://trypear.ai/customization/context-providers">
            context providers
          </a>
          ,{" "}
          <a href="https://trypear.ai/customization/slash-commands">
            slash commands
          </a>
          , and <a href="https://trypear.ai/reference/config">more</a>.
        </p>
      )}

      <br />
      <div className="flex">
        <StyledButton
          blurColor={
            selected === 0
              ? "#be841b"
              : selected === 1
              ? greenButtonColor
              : "#1b84be"
          }
          disabled={selected < 0}
          onClick={() => {
            postToIde("completeOnboarding", {
              mode: ["optimized", "local", "custom"][selected+1] as any,
            });
            setLocalStorage("onboardingComplete", true);
            handleNavigate(selected);
          }}
        >
          Continue
        </StyledButton>
      </div>
    </div>
  );
}

export default Onboarding;
