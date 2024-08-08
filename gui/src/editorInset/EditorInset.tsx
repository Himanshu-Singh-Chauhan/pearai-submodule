import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled, { keyframes } from "styled-components";
import { defaultBorderRadius } from "../components";
import TipTapEditor from "../components/mainInput/TipTapEditor";
import useSetup from "../hooks/useSetup";
import { selectSlashCommands } from "../redux/selectors";
import { RootState } from "../redux/store";
import { ideRequest, postToIde } from "../util/ide";
import { JSONContent } from "@tiptap/core";
import { InputModifiers } from "core";
import resolveEditorContent from "../components/mainInput/resolveInput";

const EditorInsetDiv = styled.div`
  max-width: 500px;
  position: relative;
  display: flex;
  border-radius: ${defaultBorderRadius};
  // box-shadow: 0 0 8px 0 rgba(0, 0, 0, 0.4);
`;

const gradient = keyframes`
  0% {
    background-position: 0px 0;
  }
  100% {
    background-position: 100em 0;
  }
`;

const GradientBorder = styled.div<{
  borderRadius?: string;
  borderColor?: string;
  loading: 0 | 1;
}>`
  border-radius: ${(props) => props.borderRadius || "0"};
  padding: 1px;
  background: ${(props) =>
    props.borderColor
      ? props.borderColor
      : `repeating-linear-gradient(
      101.79deg,
      #1BBE84 0%,
      #331BBE 16%,
      #BE1B55 33%,
      #A6BE1B 55%,
      #BE1B55 67%,
      #331BBE 85%,
      #1BBE84 99%
    )`};
  animation: ${(props) => (props.loading ? gradient : "")} 6s linear infinite;
  background-size: 200% 200%;
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 3px;
`;

function EditorInset() {
  const dispatch = useDispatch();
  const availableSlashCommands = useSelector(selectSlashCommands);
  const availableContextProviders = useSelector(
    (store: RootState) => store.state.config.contextProviders,
  );

  useSetup(dispatch);

  const elementRef = useRef(null);

  useEffect(() => {
    if (!elementRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (!elementRef.current) return;

      console.log("Height: ", elementRef.current.clientHeight);
      ideRequest("jetbrains/editorInsetHeight", {
        height: elementRef.current.clientHeight,
      });
    });
    resizeObserver.observe(elementRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const handleOnEnter = async (editorState: JSONContent, modifiers: InputModifiers) => {
    if (!elementRef.current) return;

    const [contextItems, selectedCode, content] = await resolveEditorContent(
      editorState,
      modifiers,
    );

    const prompt = content[0].text;
    // console.log("content", content[0].text);
    postToIde("pearai.quickEdit2", prompt);

    const height = elementRef.current.clientHeight;
    // ideRequest("jetbrains/editorInsetHeight", {
    //   height,
    // });
    // postToIde("pearai.quickEdit2", prompt);
  };

  const inlineActive = useSelector((store: RootState) => store.state.inlineActive);
  // const inlineActive = true;

  return (
    <EditorInsetDiv ref={elementRef} className="mt-4 border-2 border- border-red-400">
      <GradientBorder
        loading={inlineActive ? 1 : 0}
        borderColor={
          inlineActive ? undefined : "ff00ff"
        }
        borderRadius={defaultBorderRadius}
      >
        <TipTapEditor
          availableContextProviders={availableContextProviders}
          availableSlashCommands={availableSlashCommands}
          isInline={true}
          isMainInput={true}
          onEnter={handleOnEnter}
        ></TipTapEditor>
      </GradientBorder>
    </EditorInsetDiv>
  );
}

export default EditorInset;
