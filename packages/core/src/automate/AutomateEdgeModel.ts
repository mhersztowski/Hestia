/**
 * Edge model - a connection between node ports
 */

export interface AutomateEdgeModel {
  type: 'automate_edge';
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  label?: string;
  disabled?: boolean;
}
