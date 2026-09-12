export interface FileModel {
    type: "file";
    id: string;
    name: string;
    description: string;
    components: FileComponentModel[];
}

export interface FileComponentModel {
    type: string;
}

export interface FileTestComponentModel extends FileComponentModel {
    type: "file_test";
    name: string;
    description: string;
}

export interface FileJsonComponentModel extends FileComponentModel {
    type: "file_json";
    schemaPath: string;
    objectType: string;
    visible: boolean;
}

export interface FileMarkdownComponentModel extends FileComponentModel {
    type: "file_markdown";
    visible: boolean;
}
