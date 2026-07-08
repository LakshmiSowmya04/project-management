const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

const DB_FILE = path.join(__dirname, "db.json");
const FRONTEND_FOLDER = path.join(__dirname, "../frontend");

app.use(express.json());
app.use(express.static(FRONTEND_FOLDER));

function loadDB() {
  const data = fs.readFileSync(DB_FILE, "utf-8");
  return JSON.parse(data);
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;

  return `${year}-${month}-${day}`;
}

function getStatus(engineer) {
  const today = getToday();

  const isOnLeave =
    engineer.leaveFrom &&
    engineer.leaveTo &&
    engineer.leaveFrom <= today &&
    today <= engineer.leaveTo;

  if (isOnLeave) {
    return {
      status: "ON_LEAVE",
      inQueue: false,
      reason: `On leave from ${engineer.leaveFrom} to ${engineer.leaveTo}`,
    };
  }

  const hasProject =
    engineer.projectName && engineer.startDate && engineer.endDate;

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
        reason: "Project ends today. Will be added to queue tomorrow.",
      };
    }

    return {
      status: "AVAILABLE",
      inQueue: true,
      reason: "Project completed. Available for next project.",
    };
  }

  return {
    status: "AVAILABLE",
    inQueue: true,
    reason: "No active project",
  };
}

function addStatus(engineer) {
  const info = getStatus(engineer);

  return {
    ...engineer,
    status: info.status,
    inQueue: info.inQueue,
    reason: info.reason,
  };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_FOLDER, "index.html"));
});

app.get("/api/health", (req, res) => {
  res.json({
    message: "API working",
    today: getToday(),
  });
});

app.get("/api/engineers", (req, res) => {
  const db = loadDB();

  const engineers = db.engineers
    .map(addStatus)
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(engineers);
});

app.get("/api/queue", (req, res) => {
  const db = loadDB();

  const queue = db.engineers
    .map(addStatus)
    .filter((e) => e.inQueue)
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(queue);
});

app.post("/api/engineers", (req, res) => {
  const db = loadDB();

  if (!req.body.name || !req.body.skills) {
    return res.status(400).json({
      message: "Name and skills are required",
    });
  }

  const newEngineer = {
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

  db.engineers.push(newEngineer);
  saveDB(db);

  res.json({
    message: "Engineer added successfully",
    engineer: addStatus(newEngineer),
  });
});

app.post("/api/assign/:id", (req, res) => {
  const db = loadDB();
  const engineer = db.engineers.find((e) => e.id === req.params.id);

  if (!engineer) {
    return res.status(404).json({
      message: "Engineer not found",
    });
  }

  const statusInfo = getStatus(engineer);

  if (!statusInfo.inQueue) {
    return res.status(400).json({
      message: `Cannot assign. Engineer status is ${statusInfo.status}`,
    });
  }

  if (
    !req.body.projectName ||
    !req.body.pmName ||
    !req.body.leadName ||
    !req.body.startDate ||
    !req.body.endDate
  ) {
    return res.status(400).json({
      message: "Project name, PM, lead, start date, and end date are required",
    });
  }

  engineer.projectName = req.body.projectName;
  engineer.pmName = req.body.pmName;
  engineer.leadName = req.body.leadName;
  engineer.startDate = req.body.startDate;
  engineer.endDate = req.body.endDate;

  saveDB(db);

  res.json({
    message: "Project assigned successfully",
    engineer: addStatus(engineer),
  });
});

app.post("/api/leave/:id", (req, res) => {
  const db = loadDB();
  const engineer = db.engineers.find((e) => e.id === req.params.id);

  if (!engineer) {
    return res.status(404).json({
      message: "Engineer not found",
    });
  }

  if (!req.body.leaveFrom || !req.body.leaveTo) {
    return res.status(400).json({
      message: "Leave from and leave to dates are required",
    });
  }

  engineer.leaveFrom = req.body.leaveFrom;
  engineer.leaveTo = req.body.leaveTo;

  saveDB(db);

  res.json({
    message: "Leave updated successfully",
    engineer: addStatus(engineer),
  });
});

app.post("/api/clear-project/:id", (req, res) => {
  const db = loadDB();
  const engineer = db.engineers.find((e) => e.id === req.params.id);

  if (!engineer) {
    return res.status(404).json({
      message: "Engineer not found",
    });
  }

  engineer.projectName = "";
  engineer.pmName = "";
  engineer.leadName = "";
  engineer.startDate = "";
  engineer.endDate = "";

  saveDB(db);

  res.json({
    message: "Project cleared successfully",
    engineer: addStatus(engineer),
  });
});

app.post("/api/clear-leave/:id", (req, res) => {
  const db = loadDB();
  const engineer = db.engineers.find((e) => e.id === req.params.id);

  if (!engineer) {
    return res.status(404).json({
      message: "Engineer not found",
    });
  }

  engineer.leaveFrom = "";
  engineer.leaveTo = "";

  saveDB(db);

  res.json({
    message: "Leave cleared successfully",
    engineer: addStatus(engineer),
  });
});

app.delete("/api/engineers/:id", (req, res) => {
  const db = loadDB();

  const exists = db.engineers.some((e) => e.id === req.params.id);

  if (!exists) {
    return res.status(404).json({
      message: "Engineer not found",
    });
  }

  db.engineers = db.engineers.filter((e) => e.id !== req.params.id);
  saveDB(db);

  res.json({
    message: "Engineer deleted successfully",
  });
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
  console.log(`API check: http://localhost:${PORT}/api/health`);
});
