import { BudgetGroup, Currency } from "./budget.ts"

export type PlanningItemName = string;
export class PlanningItem {
    constructor(name : string, value : number,
        currency : Currency = Currency.PLN, group : BudgetGroup){
      this.name = name;
      this.value = value;
      this.currency = currency;
      this.group = group;
    }

    public static sum(items : PlanningItem[]): number{
      let result = 0.0;
      items.forEach((item: PlanningItem) => {result += item.value})
      return result;
    }

    public name : PlanningItemName;
    public value : number;
    public currency : Currency = Currency.PLN;
    public group : BudgetGroup = BudgetGroup.Shop;
}

export class PlanningFeatureMonth {
  constructor (balance : number) {
    this.balance = balance;
  }
  public balance : number = 0;
}

export class PlanningFeatureScenario {
   constructor(name : string, items : PlanningItemName[]){
    this.name = name;
    this.planningItems = items;
    this.balance = PlanningItem.sum(items);

    for ( let i = 0; i < this.planningYears * 12; i++)
    {
      this.months.push(new PlanningFeatureMonth(this.balance));
    }
   }

    public name : string= "";
    public months : PlanningFeatureMonth[]=[];
    public planningItems : PlanningItem[] = [];
    public balance : number = 0.0;
    public readonly planningYears : number = 5
}


export class Planning {
    public add(item : PlanningItem){
        this.items.push(item);
    }

    public createFeatureScenario(name : string, 
      planningItems : PlanningItemName[]= [],
      budgetGroups : BudgetGroup[] = []){
      let items : PlanningItem[] =[];

      this.items.forEach((item : PlanningItem) => { 
            if (planningItems.indexOf(item.name) >= 0)
              items.push(item)
        });

      budgetGroups.forEach((group) => {
          let items2 = this.getItemsByBudgetGroup(group);
          items2.forEach((item) => {
            if (items.indexOf(item) < 0) {
              items.push(item);
            }
          });

        }
      );

    }

    public getItemsByBudgetGroup(group : BudgetGroup) : PlanningItem[] {
      let result = this.items.filter((item : PlanningItem)=> item.group == group );
      return result;
    }

    public items : PlanningItem[];
    public featureScenario : PlanningFeatureScenario[] = [];
}
