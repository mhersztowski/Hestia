import { Planning, PlanningItem } from "./planning.ts"
export  enum IncomeKind { Work, Pension}
export enum Currency { PLN, USD, EUR }

export enum BudgetGroup {
  Bills = "Bills", 
  Shop = "Shop",
  OnlineShop = "OnlineShop",
  Subscription = "Subscription",
  Income = "Income"
}


export class  BudgetItem {

    public name : string;
}

export class Income  extends BudgetItem {
  constructor(kind : IncomeKind, value : number) {
    super();
    this.value = value;
    this.kind = kind;
  }

  public kind : IncomeKind = IncomeKind.Work;
  public value : number = 0;
  public currency : Currency = Currency.PLN;
}

export class Outgo {
  constructor(kind : IncomeKind, value : number) {
    this.value = value;
    this.kind = kind;
  }

  public kind : IncomeKind = IncomeKind.Work;
  public value : number = 0;
  public currency : Currency = Currency.PLN;
}


/*
rachunki:
wada
prad
smieci
gaz
podatek_dom
kom_internet

subskrypcje
hbo_max 20.0
google_one 8.0
legini, 15.0
czytelnia 8.0
chatgpt 100.0
tidal 27.0

*/



export class Budget {
  public init(){
    this.planning.add(
      new PlanningItem("Prąd", -200.0, Currency.PLN, BudgetGroup.Bills));
    this.planning.add(
      new PlanningItem("Woda", -150.0, Currency.PLN, BudgetGroup.Bills));
    this.planning.add(
      new PlanningItem("Śmieci", -30.0, Currency.PLN, BudgetGroup.Bills));
    this.planning.add(
      new PlanningItem("Gaz", -100.0, Currency.PLN, BudgetGroup.Bills));
    this.planning.add(
      new PlanningItem("PodatekDom", -100.0, Currency.PLN, BudgetGroup.Bills));
    this.planning.add(
      new PlanningItem("KomorkaIInternet", -90.0, Currency.PLN, BudgetGroup.Bills));
    this.planning.add(
      new PlanningItem("KomunikacjaMiejska", -30.0, Currency.PLN, BudgetGroup.Bills));

)
    this.planning.add(
      new PlanningItem("HboMax", -20.0, Currency.PLN, BudgetGroup.Subscription));
    this.planning.add(
      new PlanningItem("GoogleOne", -8.0, Currency.PLN, BudgetGroup.Subscription));
    this.planning.add(
      new PlanningItem("Legimi", -15.0, Currency.PLN, BudgetGroup.Subscription));
    this.planning.add(
      new PlanningItem("Czytelnia", -5.0, Currency.PLN, BudgetGroup.Subscription));
    this.planning.add(
      new PlanningItem("ChatGPT", -100.0, Currency.PLN, BudgetGroup.Subscription));
    this.planning.add(
      new PlanningItem("Tidal", -27.0, Currency.PLN, BudgetGroup.Subscription));

    this.planning.add(
      new PlanningItem("Wypłata", 2400.0, Currency.PLN, BudgetGroup.Income));
    this.planning.add(
      new PlanningItem("Renta", -2050.0, Currency.PLN, BudgetGroup.Income));
    this.planning.add(
      new PlanningItem("ZakupyLidl", -900.0, Currency.PLN, BudgetGroup.Shop));
    this.planning.add(
      new PlanningItem("ZakupyOnline", -300.0, Currency.PLN, BudgetGroup.OnlineShop));
    this.planning.add(
      new PlanningItem("Czasopisma", -100.0, Currency.PLN, BudgetGroup.OnlineShop));
           
    this.planning.createFeatureScenario("normal",[], 
    [BudgetGroup.Income, BudgetGroup.Bills, BudgetGroup.Subscription,
    BudgetGroup.Shop, BudgetGroup.OnlineShop]);
  }

  public load() {}

  public planning : Planning = new Planning();
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');

const input = document.createElement('input');
input.type = 'file';
input.accept = '.csv,text/csv'; // an optional type filter

input.addEventListener('change', async () => {
  const file = input.files?.[0];
    if (!file) return;

      const content: string = await file.text();
        console.log(content); // the whole file as a string
        });

        app.append(input);

//app.innerHTML = '<b>Hffello</b>'; 