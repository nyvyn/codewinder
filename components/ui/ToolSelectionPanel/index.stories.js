import React from 'react';
import ToolSelectionPanel from './index';

export default {
  title: 'ToolSelectionPanel',
  component: ToolSelectionPanel,
};

const Template = (args) => <ToolSelectionPanel {...args} />;

export const Default = Template.bind({});
Default.args = {
  tools: ['Tool A', 'Tool B', 'Tool C', 'Tool D'],
  onChange: (selectedTools) => console.log('Selected tools:', selectedTools),
};
