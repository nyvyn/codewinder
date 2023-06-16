import React, { useState } from 'react';

function ToolSelectionPanel({ tools, onChange }) {
  const [selectedTools, setSelectedTools] = useState([]);

  const handleToolSelection = (tool) => {
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
}

export default ToolSelectionPanel;
