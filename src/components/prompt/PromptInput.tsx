import { ArrowBigUp, Plus } from "lucide-react";
import { useState } from "react";
import Row from "../Row";
import DragDropWrapper from "../DragDropWrapper";
import Icon from "../common/Icon/Icon";
import styled from "styled-components";

interface SuggestionItem {
  label: string;
  value: string;
}

interface Props {
  value: string;
  setPrompt: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLFormElement>) => void;
  onFileDrop: (files: File[]) => void;
  isUploading?: boolean;
  failedFiles?: File[];
  onRetry?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  uploadProgress?: { current: number; total: number };
  currentFile?: File;
  queuedFiles?: File[];
  suggestions?: SuggestionItem[];
  onSuggestionClick?: (value: string) => void;
}

const PromptInput = ({
  value,
  setPrompt,
  onSubmit,
  onKeyDown,
  onFileDrop,
  isUploading = false,
  failedFiles = [],
  onRetry,
  onCancel,
  onDismiss,
  uploadProgress,
  currentFile,
  queuedFiles = [],
  suggestions,
  onSuggestionClick,
}: Props) => {
  return (
    <DragDropWrapper onFileDrop={onFileDrop} isUploading={isUploading} failedFiles={failedFiles} onRetry={onRetry} onCancel={onCancel} onDismiss={onDismiss} uploadProgress={uploadProgress} currentFile={currentFile} queuedFiles={queuedFiles}>
      {suggestions && suggestions.length > 0 && (
        <SuggestionRow>
          {suggestions.map((s) => (
            <SuggestionChip key={s.value} type="button" onClick={() => onSuggestionClick?.(s.value)}>
              {s.label}
            </SuggestionChip>
          ))}
        </SuggestionRow>
      )}
      <form className="promptInput" onSubmit={onSubmit} onKeyDown={onKeyDown}>
        <PromptInputTextarea value={value} setMessage={setPrompt} />
        <Row justify="space-between">
          <PromptInputTools value={value} />
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

const PromptInputTools = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value.trim()) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Row>
      <button className="iconButton">
        <Plus size={20} />
      </button>
      {value.trim() && (
        <CopyButton type="button" onClick={handleCopy} title="클립보드에 복사">
          {copied ? (
            <Icon name="Check" size={16} color="var(--color-primary, #00838a)" />
          ) : (
            <Icon name="Copy" size={16} color="var(--color-icon-tertiary, #878a92)" />
          )}
        </CopyButton>
      )}
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

const CopyButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 4px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--color-interaction-hover, rgba(24, 26, 27, 0.06));
  }
`;

const SuggestionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding: 0 0 10px;
`;

const SuggestionChip = styled.button`
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border-muted, #e6e8ea);
  background: var(--color-bg-primary, #ffffff);
  color: var(--color-text-secondary, #4b4f57);
  font-size: var(--font-size-label-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: var(--color-interaction-hover, rgba(24, 26, 27, 0.06));
    border-color: var(--color-border-strong, #c2c5cc);
  }
`;

export default PromptInput;
