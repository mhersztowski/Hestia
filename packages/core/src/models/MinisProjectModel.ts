export interface MinisProjectLibrary {
  name?: string;
  version?: string;
  url?: string;
}

export interface MinisProjectModel {
  type: 'minis_project';
  id: string;
  name: string;
  githubProjectId: string;
  githubRepoUrl?: string;
  softwarePlatform: string;
  moduleId?: string;
  boardProfileKey?: string;
  libraries?: MinisProjectLibrary[];
}

export interface MinisProjectsModel {
  type: 'minis_projects';
  projects: MinisProjectModel[];
}
