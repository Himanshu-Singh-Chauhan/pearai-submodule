import {
  PhotoIcon as OutlinePhotoIcon,
  PlusIcon,
  PaperAirplaneIcon,
  AtSymbolIcon,
  BoltIcon,
  SparklesIcon,
  ArrowUpIcon,
  PaperClipIcon,
  BarsArrowUpIcon,
} from "@heroicons/react/24/outline";
import {
  PhotoIcon,
  PhotoIcon as SolidPhotoIcon,
} from "@heroicons/react/24/solid";
import { InputModifiers } from "core";
import { modelSupportsImages } from "core/llm/autodetect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscBadgeBackground,
  vscBadgeForeground,
  vscForeground,
  vscInputBackground,
} from "..";
import { selectUseActiveFile } from "../../redux/selectors";
import { defaultModelSelector } from "../../redux/selectors/modelSelectors";
import {
  getAltKeyLabel,
  getFontSize,
  getMetaKeyLabel,
  isMetaEquivalentKeyPressed,
} from "../../util";
import ModelSelect from "../modelSelection/ModelSelect";
import { isBareChatMode, isPerplexityMode } from "../../util/bareChatMode";
import { setDefaultModel } from "../../redux/slices/stateSlice";
import { RootState } from "@/redux/store";
import { useLocation } from "react-router-dom";

const StyledDiv = styled.div<{ isHidden: boolean }>`
  padding: 4px 0;
  display: flex;
  justify-content: space-between;
  gap: 1px;
  background-color: ${vscInputBackground};
  align-items: center;
  z-index: 50;
  font-size: ${getFontSize() - 2}px;
  cursor: ${(props) => (props.isHidden ? "default" : "text")};
  opacity: ${(props) => (props.isHidden ? 0 : 1)};
  pointer-events: ${(props) => (props.isHidden ? "none" : "auto")};

  & > * {
    flex: 0 0 auto;
  }

  /* Add a media query to hide the right-hand set of components */
  @media (max-width: 300px) {
    & > span:last-child {
      display: none;
    }
  }
`;

const StyledSpan = styled.span`
  padding: 3px 4px;
  display: flex;
  align-items: center;
  border-radius: ${defaultBorderRadius};

  font-size: ${() => `${getFontSize() - 2}px`};
  color: ${lightGray};

  &:hover {
    background-color: ${vscBadgeBackground};
    color: ${vscBadgeForeground};
  }
`;

const EnterButton = styled.div<{ offFocus: boolean }>`
  padding: 2px 4px;
  display: flex;
  align-items: center;

  background-color: ${(props) =>
    props.offFocus ? undefined : lightGray + "33"};
  border-radius: ${defaultBorderRadius};
  color: ${vscForeground};

  &:hover {
    background-color: ${vscBadgeBackground};
    color: ${vscBadgeForeground};
  }

  cursor: pointer;
`;

interface InputToolbarProps {
  onEnter?: (modifiers: InputModifiers) => void;
  usingCodebase?: boolean;
  onAddContextItem?: () => void;

  onClick?: () => void;

  onImageFileSelected?: (file: File) => void;

  hidden?: boolean;
  showNoContext: boolean;
}

function InputToolbar(props: InputToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileSelectHovered, setFileSelectHovered] = useState(false);
  const defaultModel = useSelector(defaultModelSelector);
  const bareChatMode = isBareChatMode();
  const perplexityMode = isPerplexityMode();

  const useActiveFile = useSelector(selectUseActiveFile);
  const allModels = useSelector(
    (state: RootState) => state.state.config.models,
  );

  const dispatch = useDispatch();
  const location = useLocation();

  useEffect(() => {
    console.dir(location.pathname.split("/").pop());
    if (location.pathname.split("/").pop() === "aiderMode") {
      const aider = allModels.find((model) =>
        model?.title?.toLowerCase().includes("aider"),
      );
      dispatch(setDefaultModel({ title: aider?.title }));
    } else if (location.pathname.split("/").pop() === "perplexityMode") {
      const perplexity = allModels.find((model) =>
        model?.title?.toLowerCase().includes("perplexity"),
      );
      dispatch(setDefaultModel({ title: perplexity?.title }));
    }
  }, [location, allModels]);

  return (
    <>
      <StyledDiv
        isHidden={props.hidden}
        onClick={props.onClick}
        id="input-toolbar"
      >
        <span className="flex gap-0.5 items-center whitespace-nowrap">
          {/* {!bareChatMode && (
            <>
              {!perplexityMode && <ModelSelect />}
              <StyledSpan
                onClick={(e) => {
                  props.onAddContextItem();
                }}
                className="hover:underline cursor-pointer"
              >
                Add Context{" "}
                <PlusIcon className="h-2.5 w-2.5" aria-hidden="true" />
              </StyledSpan>
            </>
          )} */}
          {defaultModel &&
            modelSupportsImages(
              defaultModel.provider,
              defaultModel.model,
              defaultModel.title,
              defaultModel.capabilities,
            ) && (
              <span
                className="mt-0.5 cursor-pointer"
                onMouseLeave={() => setFileSelectHovered(false)}
                onMouseEnter={() => setFileSelectHovered(true)}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept=".jpg,.jpeg,.png,.gif,.svg,.webp"
                  onChange={(e) => {
                    for (const file of e.target.files) {
                      props.onImageFileSelected(file);
                    }
                  }}
                />
                {fileSelectHovered ? (
                  <StyledSpan>
                    <SolidPhotoIcon
                      className="h-4 w-4"
                      color={lightGray}
                      onClick={(e) => {
                        fileInputRef.current?.click();
                      }}
                    />
                  </StyledSpan>
                ) : (
                  <StyledSpan>
                    <OutlinePhotoIcon
                      className="h-4 w-4"
                      color={lightGray}
                      onClick={(e) => {
                        fileInputRef.current?.click();
                      }}
                    />
                  </StyledSpan>
                )}
              </span>
            )}
          {!bareChatMode && (
            <>
              <StyledSpan
                onClick={(e) => {
                  props.onAddContextItem();
                }}
                className="hover:underline cursor-pointer"
              >
                <AtSymbolIcon className="h-4 w-4" aria-hidden="true" />
              </StyledSpan>

              <StyledSpan
                style={{
                  color: props.usingCodebase ? vscBadgeBackground : lightGray,
                  backgroundColor: props.usingCodebase
                    ? lightGray + "33"
                    : undefined,
                  borderRadius: defaultBorderRadius,
                  padding: "2px 4px",
                }}
                onClick={(e) => {
                  props.onEnter({
                    useCodebase: true,
                    noContext: !useActiveFile,
                  });
                }}
                className={"hover:underline cursor-pointer float-right"}
              >
                <Sparkles3
                  // className="h-5 w-4"
                  aria-hidden="true"
                  // fill="currentColor"
                />
              </StyledSpan>
            </>
          )}
        </span>

        <span className="flex items-center gap-2 whitespace-nowrap">
          {props.showNoContext ? (
            <span
              style={{
                color: props.usingCodebase ? vscBadgeBackground : lightGray,
                backgroundColor: props.usingCodebase
                  ? lightGray + "33"
                  : undefined,
                borderRadius: defaultBorderRadius,
                padding: "2px 4px",
              }}
            >
              <span className="font-mono">{getAltKeyLabel()} Enter </span>
              {useActiveFile ? "No context" : "to Use active file"}
            </span>
          ) : !bareChatMode ? (
            <StyledSpan
              style={{
                color: props.usingCodebase ? vscBadgeBackground : lightGray,
                backgroundColor: props.usingCodebase
                  ? lightGray + "33"
                  : undefined,
                borderRadius: defaultBorderRadius,
                padding: "2px 4px",
              }}
              onClick={(e) => {
                props.onEnter({
                  useCodebase: true,
                  noContext: !useActiveFile,
                });
              }}
              className={"cursor-pointer float-right"}
            >
              {/* <span>{getMetaKeyLabel()} +</span>
              &nbsp;
              <span>Enter</span>
              &nbsp;
              Use codebase */}
              <BarsArrowUpIcon
                className="h-4 w-4"
                strokeWidth={2}
                aria-hidden="true"
              />
            </StyledSpan>
          ) : null}
          <EnterButton
            offFocus={props.usingCodebase}
            onClick={(e) => {
              props.onEnter({
                useCodebase: isMetaEquivalentKeyPressed(e),
                noContext: useActiveFile ? e.altKey : !e.altKey,
              });
            }}
          >
            <ArrowUpIcon
              className="h-4 w-3"
              strokeWidth={3}
              aria-hidden="true"
            />
          </EnterButton>
        </span>
      </StyledDiv>
    </>
  );
}

export default InputToolbar;

const Sparkles2 = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="size-4"
  >
    <path
      fillRule="evenodd"
      d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z"
      clipRule="evenodd"
    />
  </svg>
);

const Sparkles3 = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="size-4"
  >
    <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
  </svg>
);
