import { Planning, PlanningItem, PlanningFeatureScenario } from "./planning.ts"
import { Budget, BudgetItem, BudgetGroup } from "./budget.ts"

export class UIHtml {
    public generate(budget : Budget) {
      this.generatePlanning(budget);
    }

    public generatePlanning(budget : Budget) {
      let planning =  budget.planning;
      this.output += "<h1>Planning<h1>";

      planning.featureScenario.forEach((scenario) => {
        this.output += `<h3>${scenario.name}</h3>`;
        let data : object[][]= [];

        scenario.months.forEach((month, index)=>{
            data.push([index, month.balance]);
        })
      })
    }

    public generateTable(labels : string[], data : object[][]) {
        this.output += "<table>";
        this.output += "<thead><tr>";
        labels.forEach((label) => this.output+= `<th>${label}</th>`);
        this.output += "</tr></thead>";
        this.output += "<tbody>";
        data.forEach((item) => {
          this.output += "<tr>";
          item.forEach((data)=> this.output += `<td>${data}</td>`);
          this.output += "</tr>";
        });
        this.output += "</tbody></table>";
    }

    public output : string = "";
}