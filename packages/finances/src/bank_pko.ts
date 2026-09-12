import { Budget } from "./budget.ts"
import Papa from 'papaparse';

interface Row {
  dateOperation: Date;
  date: Date; 
  transationType : string;
  value : number;
  currency : string;
  balance : number;         // the balance after the transaction
  description: number;
}

    const result = Papa.parse<Row>(csvString, {
      header: true,          // the first row as the objects' keys
        skipEmptyLines: true,
          dynamicTyping: true,   // auto-conversion to number/boolean
          });

class PkoCSVData {
    
    public static load(budget : Budget , path: string)  {
        budget
    }
}