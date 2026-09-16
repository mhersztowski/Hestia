/**
 * The plain form of a tab bar.
 *
 * Tabs are the third way of choosing one of several things, after a radio group
 * and a menu, and the one that shows what the choices are without being asked.
 * A tab is a title, perhaps an icon, and something the host draws when the tab
 * is the current one.
 *
 * The live form is `coreobject/ui/TabBar`, where the current tab is a `Property`
 * and each tab carries its own commands as `Action`s.
 */

export interface TabNode {
  id: string;
  title?: string;
  /** Kept and handed back untouched, as everywhere else. */
  icon?: unknown;
  /** Hover text. Falls back to the title. */
  tooltip?: string;
  /** Whether it has a × of its own. A tab that must stay says so here. */
  closable?: boolean;
  /**
   * Unsaved changes — the dot an editor puts where the × goes.
   * The bar only carries it; what counts as modified is the host's business.
   */
  modified?: boolean;
  /** Whatever the host draws for this tab. */
  content?: unknown;
  /** Shut without being destroyed: it keeps its place and can come back. */
  hidden?: boolean;
}

export interface TabBarModel {
  id?: string;
  tabs: TabNode[];
  /** Which tab is current. Left out, the first one is. */
  currentId?: string;
}

export function tab(id: string, title: string, rest: Omit<TabNode, 'id' | 'title'> = {}): TabNode {
  return { id, title, ...rest };
}

export function tabBar(tabs: TabNode[], currentId?: string, id?: string): TabBarModel {
  return { id, tabs, currentId };
}

/** The tabs that are on screen at all. */
export function visibleTabs(model: TabBarModel): TabNode[] {
  return model.tabs.filter((t) => !t.hidden);
}

/** Which tab a model says is current — the named one, or the first that is showing. */
export function currentTab(model: TabBarModel): TabNode | undefined {
  const showing = visibleTabs(model);
  if (model.currentId === undefined) return showing[0];
  return showing.find((t) => t.id === model.currentId) ?? showing[0];
}
