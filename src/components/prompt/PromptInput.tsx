import { ArrowBigUp, Plus } from "lucide-react";
import Row from "../Row";
import DragDropWrapper from "../DragDropWrapper";

interface Props {
  value: string;
  setPrompt: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLFormElement>) => void;
  onFileDrop: (file: File) => void;
  isUploading?: boolean;
}

const PromptInput = ({
  value,
  setPrompt,
  onSubmit,
  onKeyDown,
  onFileDrop,
  isUploading = false,
}: Props) => {
  return (
    <DragDropWrapper onFileDrop={onFileDrop} isUploading={isUploading}>
      <form className="promptInput" onSubmit={onSubmit} onKeyDown={onKeyDown}>
        <PromptInputTextarea value={value} setMessage={setPrompt} />
        <Row justify="space-between">
          <PromptInputTools />
          <PromptSubmitButton />
        </Row>
      </form>
    </DragDropWrapper>
  );
};

const PromptInputTextarea = ({
  value,
  setMessage,
}: {
  value: string;
  setMessage: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) => {
  return (
    <textarea
      className="promptInputTextarea"
      placeholder="메시지를 입력하세요..."
      value={value}
      onChange={setMessage}
    />
  );
};

const PromptInputTools = () => {
  return (
    <Row>
      <button className="iconButton">
        <Plus size={20} />
      </button>
    </Row>
  );
};

const PromptSubmitButton = () => {
  return (
    <button type="submit" className="sendBtn">
      <ArrowBigUp size={20} />
    </button>
  );
};

export default PromptInput;
