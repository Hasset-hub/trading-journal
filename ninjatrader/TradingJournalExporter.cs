//
// TradingJournalExporter.cs
// -------------------------------------------------------------------------
// A NinjaTrader 8 add-on that writes every account execution (fill) to a CSV
// file so your trading journal can auto-import it. It runs quietly in the
// background — no chart, no window. Install once, restart NinjaTrader, and it
// keeps the file up to date as you trade.
//
// Output: Documents\TradingJournalSync\executions.csv
// Columns: executionId,time,account,symbol,contract,action,quantity,price,commission,marketPosition
//
// INSTALL
//   Option A (recommended): NinjaTrader → Tools → Import → NinjaScript Add-On…
//                           and pick this .cs file, then restart NinjaTrader.
//   Option B: copy this file into
//             Documents\NinjaTrader 8\bin\Custom\AddOns\
//             open the NinjaScript Editor, press F5 to compile, then restart.
//
// The journal reads this file locally via your browser — nothing is uploaded.
// -------------------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using NinjaTrader.Cbi;
using NinjaTrader.NinjaScript;

namespace NinjaTrader.NinjaScript.AddOns
{
    public class TradingJournalExporter : AddOnBase
    {
        private string filePath;
        private readonly object fileLock = new object();
        private readonly HashSet<string> written = new HashSet<string>();
        private readonly List<Account> hooked = new List<Account>();

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name = "TradingJournalExporter";
            }
            else if (State == State.Configure)
            {
                try
                {
                    string dir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                        "TradingJournalSync");
                    Directory.CreateDirectory(dir);
                    filePath = Path.Combine(dir, "executions.csv");

                    EnsureHeader();
                    LoadExistingIds();   // so restarts never duplicate rows already written

                    lock (Account.All)
                    {
                        foreach (Account a in Account.All)
                        {
                            a.ExecutionUpdate += OnExecutionUpdate;
                            hooked.Add(a);
                        }
                    }

                    Log("TradingJournalExporter active -> " + filePath);
                }
                catch (Exception e)
                {
                    Log("TradingJournalExporter configure error: " + e.Message);
                }
            }
            else if (State == State.Terminated)
            {
                foreach (Account a in hooked)
                    a.ExecutionUpdate -= OnExecutionUpdate;
                hooked.Clear();
            }
        }

        private void EnsureHeader()
        {
            lock (fileLock)
            {
                if (!File.Exists(filePath) || new FileInfo(filePath).Length == 0)
                    File.WriteAllText(filePath,
                        "executionId,time,account,symbol,contract,action,quantity,price,commission,marketPosition" + Environment.NewLine);
            }
        }

        private void LoadExistingIds()
        {
            try
            {
                bool first = true;
                foreach (string line in File.ReadLines(filePath))
                {
                    if (first) { first = false; continue; } // header
                    int comma = line.IndexOf(',');
                    if (comma > 0) written.Add(line.Substring(0, comma));
                }
            }
            catch (Exception e) { Log("TradingJournalExporter id-load error: " + e.Message); }
        }

        private void OnExecutionUpdate(object sender, ExecutionEventArgs e)
        {
            try
            {
                Execution ex = e.Execution;
                if (ex == null || ex.Instrument == null) return;

                string id = ex.ExecutionId ?? "";
                if (id.Length > 0 && !written.Add(id)) return; // already exported

                string action = "";
                if (ex.Order != null) action = ex.Order.OrderAction.ToString(); // Buy / Sell / BuyToCover / SellShort
                if (string.IsNullOrEmpty(action)) action = ex.MarketPosition.ToString();

                string symbol = ex.Instrument.MasterInstrument != null
                    ? ex.Instrument.MasterInstrument.Name
                    : ex.Instrument.FullName;

                CultureInfo ci = CultureInfo.InvariantCulture;
                string line = string.Join(",", new string[]
                {
                    Csv(id),
                    ex.Time.ToString("yyyy-MM-dd HH:mm:ss", ci),
                    Csv(ex.Account != null ? ex.Account.Name : ""),
                    Csv(symbol),
                    Csv(ex.Instrument.FullName),
                    Csv(action),
                    ex.Quantity.ToString(ci),
                    ex.Price.ToString(ci),
                    ex.Commission.ToString(ci),
                    Csv(ex.MarketPosition.ToString())
                });

                lock (fileLock)
                {
                    File.AppendAllText(filePath, line + Environment.NewLine);
                }
            }
            catch (Exception ex2)
            {
                Log("TradingJournalExporter write error: " + ex2.Message);
            }
        }

        private static string Csv(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            if (s.IndexOf(',') >= 0 || s.IndexOf('"') >= 0 || s.IndexOf('\n') >= 0)
                return "\"" + s.Replace("\"", "\"\"") + "\"";
            return s;
        }

        private static void Log(string msg)
        {
            try { NinjaTrader.Code.Output.Process(msg, PrintTo.OutputTab1); } catch { }
        }
    }
}
