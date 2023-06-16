import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import ToolSelectionPanel from './index';

test('renders ToolSelectionPanel component', () => {
  const tools = ['Tool A', 'Tool B', 'Tool C', 'Tool D'];
  const onChange = jest.fn();
  const { getByText, getByLabelText } = render(
    <ToolSelectionPanel tools={tools} onChange={onChange} />
  );

  tools.forEach((tool) => {
    const checkbox = getByLabelText(tool);
    fireEvent.click(checkbox);
  });

  expect(onChange).toHaveBeenCalledTimes(tools.length);
  expect(onChange).toHaveBeenCalledWith(tools);
});
