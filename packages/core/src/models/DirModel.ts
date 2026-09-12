import { FileModel } from "./FileModel";

export interface DirModel {
    type: "dir";
    id: string;
    name: string;
    description: string;
    components: DirComponentModel[];
    files: FileModel[];
}

export interface DirComponentModel {
    type: string;
}

export interface DirTestComponentModel extends DirComponentModel {
    type: "dir_test";
    name: string;
    description: string;
}
