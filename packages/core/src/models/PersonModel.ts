export interface PersonModel {
    type: "person";
    id: string;
    nick: string;
    firstName?: string;
    secondName?: string;
    description?: string;
}

export interface PersonsModel {
    type: "persons";
    items: PersonModel[];
}
