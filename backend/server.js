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
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
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

function generateId(prefix, items) {
  let max = 0;

  items.forEach((item) => {
    if (item.id && item.id.startsWith(prefix)) {
      const number = parseInt(item.id.replace(prefix, ""), 10);
      if (!isNaN(number) && number > max) {
        max = number;
      }
    }
  });

  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function getEngineerStatus(engineer) {
  const today = getToday();

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
    engineer.clientId &&
    engineer.projectName &&
    engineer.startDate &&
    engineer.endDate;

  if (hasProject) {
    if (today < engineer.startDate) {
      return {
        status: "RESERVED",
        inQueue: false,
        reason: `Reserved for ${engineer.clientName}`,
      };
    }

    if (today < engineer.endDate) {
      return {
        status: "BUSY",
        inQueue: false,
        reason: `Working for ${engineer.clientName}`,
      };
    }

    if (today === engineer.endDate) {
      return {
        status: "COMPLETING_TODAY",
        inQueue: false,
        reason: `Completing ${engineer.clientName} today. Will enter queue tomorrow.`,
      };
    }

    return {
      status: "AVAILABLE",
      inQueue: true,
      reason: "Previous project completed. Available for next client.",
    };
  }

  return {
    status: "AVAILABLE",
    inQueue: true,
    reason: "No active client/project",
  };
}

function getClientStatus(client) {
  const today = getToday();

  if (!client.assignedEngineerId) {
    return {
      status: "CLIENT_QUEUE",
      reason: "Waiting for engineer assignment",
    };
  }

  if (today < client.startDate) {
    return {
      status: "SCHEDULED",
      reason: `Scheduled with ${client.assignedEngineerName}`,
    };
  }

  if (today < client.endDate) {
    return {
      status: "IN_PROGRESS",
      reason: `${client.assignedEngineerName} is working on this client`,
    };
  }

  if (today === client.endDate) {
    return {
      status: "ENDING_TODAY",
      reason: `${client.assignedEngineerName} is completing today`,
    };
  }

  return {
    status: "COMPLETED",
    reason: "Client project completed",
  };
}

function addEngineerStatus(engineer) {
  const info = getEngineerStatus(engineer);

  return {
    ...engineer,
    status: info.status,
    inQueue: info.inQueue,
    reason: info.reason,
  };
}

function addClientStatus(client) {
  const info = getClientStatus(client);

  return {
    ...client,
    status: info.status,
    reason: info.reason,
  };
}

app.get(["/", "/engineers", "/clients"], (req, res) => {
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
    .map(addEngineerStatus)
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(engineers);
});

app.get("/api/queue", (req, res) => {
  const db = loadDB();

  const queue = db.engineers
    .map(addEngineerStatus)
    .filter((e) => e.inQueue)
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(queue);
});

app.post("/api/engineers", (req, res) => {
  const db = loadDB();

  if (!req.body.name || !req.body.skills || !req.body.level) {
    return res.status(400).json({
      message: "Engineer name, skills, and level are required",
    });
  }

  const engineer = {
    id: generateId("E", db.engineers),
    name: req.body.name,
    skills: req.body.skills,
    level: req.body.level,
    leaveFrom: "",
    leaveTo: "",
    clientId: "",
    clientName: "",
    projectName: "",
    projectType: "",
    pmName: "",
    leadId: "",
    leadName: "",
    startDate: "",
    endDate: "",
  };

  db.engineers.push(engineer);
  saveDB(db);

  res.json({
    message: "Engineer added successfully",
    engineer: addEngineerStatus(engineer),
  });
});

app.delete("/api/engineers/:id", (req, res) => {
  const db = loadDB();

  const engineer = db.engineers.find((e) => e.id === req.params.id);

  if (!engineer) {
    return res.status(404).json({
      message: "Engineer not found",
    });
  }

  db.clients.forEach((client) => {
    if (client.assignedEngineerId === engineer.id) {
      client.assignedEngineerId = "";
      client.assignedEngineerName = "";
      client.leadId = "";
      client.leadName = "";
      client.startDate = "";
      client.endDate = "";
    }
  });

  db.engineers = db.engineers.filter((e) => e.id !== req.params.id);
  saveDB(db);

  res.json({
    message: "Engineer deleted successfully",
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
    engineer: addEngineerStatus(engineer),
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
    engineer: addEngineerStatus(engineer),
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

  const client = db.clients.find((c) => c.id === engineer.clientId);

  if (client) {
    client.assignedEngineerId = "";
    client.assignedEngineerName = "";
    client.leadId = "";
    client.leadName = "";
    client.startDate = "";
    client.endDate = "";
  }

  engineer.clientId = "";
  engineer.clientName = "";
  engineer.projectName = "";
  engineer.projectType = "";
  engineer.pmName = "";
  engineer.leadId = "";
  engineer.leadName = "";
  engineer.startDate = "";
  engineer.endDate = "";

  saveDB(db);

  res.json({
    message: "Project cleared. Client moved back to client queue.",
    engineer: addEngineerStatus(engineer),
  });
});

app.get("/api/leads", (req, res) => {
  const db = loadDB();

  const leads = db.leads.sort((a, b) => a.name.localeCompare(b.name));

  res.json(leads);
});

app.post("/api/leads", (req, res) => {
  const db = loadDB();

  if (!req.body.name || !req.body.skills) {
    return res.status(400).json({
      message: "Lead name and skills are required",
    });
  }

  const lead = {
    id: generateId("L", db.leads),
    name: req.body.name,
    skills: req.body.skills,
  };

  db.leads.push(lead);
  saveDB(db);

  res.json({
    message: "Lead added successfully",
    lead,
  });
});

app.delete("/api/leads/:id", (req, res) => {
  const db = loadDB();

  const lead = db.leads.find((l) => l.id === req.params.id);

  if (!lead) {
    return res.status(404).json({
      message: "Lead not found",
    });
  }

  db.clients.forEach((client) => {
    if (client.leadId === lead.id) {
      client.leadId = "";
      client.leadName = "";
    }
  });

  db.engineers.forEach((engineer) => {
    if (engineer.leadId === lead.id) {
      engineer.leadId = "";
      engineer.leadName = "";
    }
  });

  db.leads = db.leads.filter((l) => l.id !== req.params.id);

  saveDB(db);

  res.json({
    message: "Lead deleted successfully",
  });
});

app.get("/api/clients", (req, res) => {
  const db = loadDB();

  const clients = db.clients
    .map(addClientStatus)
    .sort((a, b) => a.clientName.localeCompare(b.clientName));

  res.json(clients);
});

app.get("/api/client-queue", (req, res) => {
  const db = loadDB();

  const clients = db.clients
    .map(addClientStatus)
    .filter((c) => c.status === "CLIENT_QUEUE")
    .sort((a, b) => a.clientName.localeCompare(b.clientName));

  res.json(clients);
});

app.get("/api/active-clients", (req, res) => {
  const db = loadDB();

  const clients = db.clients
    .map(addClientStatus)
    .filter(
      (c) =>
        c.status === "IN_PROGRESS" ||
        c.status === "ENDING_TODAY" ||
        c.status === "SCHEDULED",
    )
    .sort((a, b) => a.clientName.localeCompare(b.clientName));

  res.json(clients);
});

app.post("/api/clients", (req, res) => {
  const db = loadDB();

  if (
    !req.body.clientName ||
    !req.body.projectName ||
    !req.body.projectType ||
    !req.body.priority ||
    !req.body.requestedSkills ||
    !req.body.pmName
  ) {
    return res.status(400).json({
      message:
        "Client name, project, type, priority, requested skills, and PM are required",
    });
  }

  const client = {
    id: generateId("C", db.clients),
    clientName: req.body.clientName,
    projectName: req.body.projectName,
    projectType: req.body.projectType,
    priority: req.body.priority,
    requestedSkills: req.body.requestedSkills,
    pmName: req.body.pmName,
    leadId: "",
    leadName: "",
    assignedEngineerId: "",
    assignedEngineerName: "",
    startDate: "",
    endDate: "",
  };

  db.clients.push(client);
  saveDB(db);

  res.json({
    message: "Client added to queue successfully",
    client: addClientStatus(client),
  });
});

app.post("/api/clients/:clientId/assign", (req, res) => {
  const db = loadDB();

  const client = db.clients.find((c) => c.id === req.params.clientId);
  const engineer = db.engineers.find((e) => e.id === req.body.engineerId);
  const lead = db.leads.find((l) => l.id === req.body.leadId);

  if (!client) {
    return res.status(404).json({
      message: "Client not found",
    });
  }

  if (!engineer) {
    return res.status(404).json({
      message: "Engineer not found",
    });
  }

  if (!lead) {
    return res.status(404).json({
      message: "Lead not found",
    });
  }

  const engineerStatus = getEngineerStatus(engineer);

  if (!engineerStatus.inQueue) {
    return res.status(400).json({
      message: `Engineer not available. Current status: ${engineerStatus.status}`,
    });
  }

  if (!req.body.startDate || !req.body.endDate) {
    return res.status(400).json({
      message: "Start date and end date are required",
    });
  }

  client.assignedEngineerId = engineer.id;
  client.assignedEngineerName = engineer.name;
  client.leadId = lead.id;
  client.leadName = lead.name;
  client.startDate = req.body.startDate;
  client.endDate = req.body.endDate;

  engineer.clientId = client.id;
  engineer.clientName = client.clientName;
  engineer.projectName = client.projectName;
  engineer.projectType = client.projectType;
  engineer.pmName = client.pmName;
  engineer.leadId = lead.id;
  engineer.leadName = lead.name;
  engineer.startDate = req.body.startDate;
  engineer.endDate = req.body.endDate;

  saveDB(db);

  res.json({
    message: "Client assigned successfully",
    client: addClientStatus(client),
    engineer: addEngineerStatus(engineer),
  });
});

app.delete("/api/clients/:id", (req, res) => {
  const db = loadDB();

  const client = db.clients.find((c) => c.id === req.params.id);

  if (!client) {
    return res.status(404).json({
      message: "Client not found",
    });
  }

  const engineer = db.engineers.find((e) => e.clientId === client.id);

  if (engineer) {
    engineer.clientId = "";
    engineer.clientName = "";
    engineer.projectName = "";
    engineer.projectType = "";
    engineer.pmName = "";
    engineer.leadId = "";
    engineer.leadName = "";
    engineer.startDate = "";
    engineer.endDate = "";
  }

  db.clients = db.clients.filter((c) => c.id !== req.params.id);

  saveDB(db);

  res.json({
    message: "Client deleted successfully",
  });
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
  console.log(`Engineers page: http://localhost:${PORT}/engineers`);
  console.log(`Clients page: http://localhost:${PORT}/clients`);
});
