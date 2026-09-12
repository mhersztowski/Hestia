export interface UserModel {
    type: "user";
    id: string;
    name: string;
    password: string;
    isAdmin: boolean;
    roles: string[];
}

export interface UsersModel {
    type: "users";
    items: UserModel[];
}
