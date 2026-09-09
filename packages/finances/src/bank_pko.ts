import { Budget } from "./budget.ts"
import Papa from 'papaparse';

interface Row {
  dateOperation: Date;
  date: Date; 
  transationType : string;
  value : number;
  currency : string;
  balance : number;         // saldo po tranzakcji
  description: number;
}

    const result = Papa.parse<Row>(csvString, {
      header: true,          // pierwszy wiersz jako klucze obiektów
        skipEmptyLines: true,
          dynamicTyping: true,   // auto-konwersja na number/boolean
          });

class PkoCSVData {
    
    public static load(budget : Budget , path: string)  {
        budget
    }
}