const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

const DB_FILE = "./db.json";

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ engineers: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function todayIST() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;

  return `${y}-${m}-${d}`;
}

function getStatus(engineer) {
  const today = todayIST();

  const onLeave =
    engineer.leaveFrom &&
    engineer.leaveTo &&
    engineer.leaveFrom <= today &&
    today <= engineer.leaveTo;

  if (onLeave) {
    return {
      status: "ON_LEAVE",
      inQueue: false,
      reason: `On leave from ${engineer.leaveFrom} to ${engineer.leaveTo}`,
    };
  }

  const hasProject =
    engineer.projectName &&
    engineer.startDate &&
    engineer.endDate;

  if (hasProject) {
    if (today < engineer.startDate) {
      return {
        status: "RESERVED",
        inQueue: false,
        reason: `Reserved for ${engineer.projectName}`,
      };
    }

    if (today < engineer.endDate) {
      return {
        status: "BUSY",
        inQueue: false,
        reason: `Working on ${engineer.projectName}`,
      };
    }

    if (today === engineer.endDate) {
      return {
        status: "COMPLETING_TODAY",
        inQueue: false,
        reason: `Completing ${engineer.projectName} today`,
      };
    }

    if (today > engineer.endDate) {
      return {
        status: "AVAILABLE",
        inQueue: true,
        reason: "Project completed",
      };
    }
  }

  return {
    status: "AVAILABLE",
    inQueue: true,
    reason: "No active project",
  };
}

function attachStatus(engineer) {
  const result = getStatus(engineer);
  return {
    ...engineer,
    status: result.status,
    inQueue: result.inQueue,
    reason: result.reason,
  };
}

app.get("/api/engineers", (req, res) => {
  const db = loadDB();
  const engineers = db.engineers.map(attachStatus);
  res.json(engineers);
});

app.get("/api/queue", (req, res) => {
  const db = loadDB();

  const queue = db.engineers
    .map(attachStatus)
    .filter(e => e.inQueue);

  res.json(queue);
});

app.post("/api/engineers", (req, res) => {
  const db = loadDB();

  const engineer = {
    id: Date.now().toString(),
    name: req.body.name,
    skills: req.body.skills,
    projectName: "",
    pmName: "",
    leadName: "",
    startDate: "",
    endDate: "",
    leaveFrom: "",
    leaveTo: "",
  };

  db.engineers.push(engineer);
  saveDB(db);

  res.json({ message: "Engineer added", engineer });
});

app.post("/api/assign/:id", (req, res) => {
  const db = loadDB();
  const engineer = db.engineers.find(e => e.id === req.params.id);

  if (!engineer) {
    return res.status(404).json({ message: "Engineer not found" });
  }

  engineer.projectName = req.body.projectName;
  engineer.pmName = req.body.pmName;
  engineer.leadName = req.body.leadName;
  engineer.startDate = req.body.startDate;
  engineer.endDate = req.body.endDate;

  saveDB(db);

  res.json({ message: "Project assigned", engineer });
});

app.post("/api/leave/:id", (req, res) => {
  const db = loadDB();
  const engineer = db.engineers.find(e => e.id === req.params.id);

  if (!engineer) {
    return res.status(404).json({ message: "Engineer not found" });
  }

  engineer.leaveFrom = req.body.leaveFrom;
  engineer.leaveTo = req.body.leaveTo;

  saveDB(db);

  res.json({ message: "Leave updated", engineer });
});

app.post("/api/clear-project/:id", (req, res) => {
  const db = loadDB();
  const engineer = db.engineers.find(e => e.id === req.params.id);

  if (!engineer) {
    return res.status(404).json({ message: "Engineer not found" });
  }

  engineer.projectName = "";
  engineer.pmName = "";
  engineer.leadName = "";
  engineer.startDate = "";
  engineer.endDate = "";

  saveDB(db);

  res.json({ message: "Project cleared", engineer });
});

app.post("/api/clear-leave/:id", (req, res) => {
  const db = loadDB();
  const engineer = db.engineers.find(e => e.id === req.params.id);

  if (!engineer) {
    return res.status(404).json({ message: "Engineer not found" });
  }

  engineer.leaveFrom = "";
  engineer.leaveTo = "";

  saveDB(db);

  res.json({ message: "Leave cleared", engineer });
});

app.listen(PORT, () => {
  console.log(`App running at http://localhost:${PORT}`);
});