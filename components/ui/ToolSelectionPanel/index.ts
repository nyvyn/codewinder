import React, { useState } from 'react';

interface ToolSelectionPanelProps {
  tools: string[];
  onChange: (selectedTools: string[]) => void;
}

const ToolSelectionPanel: React.FC<ToolSelectionPanelProps> = ({ tools, onChange }) => {
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  const handleToolSelection = (tool: string) => {
    if (selectedTools.includes(tool)) {
      setSelectedTools(selectedTools.filter((selectedTool) => selectedTool !== tool));
    } else {
      setSelectedTools([...selectedTools, tool]);
    }
    onChange(selectedTools);
  };

  return (
    <div>
      {tools.map((tool) => (
        <div key={tool}>
          <input
            type="checkbox"
            id={tool}
            name={tool}
            checked={selectedTools.includes(tool)}
            onChange={() => handleToolSelection(tool)}
          />
          <label htmlFor={tool}>{tool}</label>
        </div>
      ))}
    </div>
  );
};

export default ToolSelectionPanel;
