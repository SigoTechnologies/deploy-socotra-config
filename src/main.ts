import axios from "axios";
import archiver from "archiver";
import * as core from "@actions/core";
import FormData from "form-data";
import fs from "fs";
import os from "os";
import path from "path";

interface AuthResponse {
  authorizationToken: string;
  expiresTimestamp: string;
}

interface DeployResponse {
  hostname: string;
  logfile: string;
  success: boolean;
  tenantName: string;
}

interface ConfigVersionResponse {
  version: string;
  deployedTimestamp: string;
}

class DeploymentManager {
  tenantName: string;

  apiBase: string;
  adminAuthEndpoint: string;
  apiAuthEndpoint: string;
  deployEndpoint: string;
  repairEndpoint: string;
  versionsEndpoint: string;

  adminAuthToken: string;
  apiAuthToken: string;
  adminUsername: string;
  adminPassword: string;
  apiUsername: string;
  apiPassword: string;

  version: string;
  configPath: string;

  constructor() {
    this.tenantName = core.getInput("tenant-name");

    this.adminUsername = core.getInput("admin-username");
    this.adminPassword = core.getInput("admin-password");

    this.apiUsername = core.getInput("api-username");
    this.apiPassword = core.getInput("api-password");

    this.apiBase = core.getInput("api-base");

    const authUrl = new URL("/account/authenticate", this.apiBase);
    const deployUrl = new URL("/configuration/deploy", this.apiBase);
    const repairUrl = new URL("/configuration/repair", this.apiBase);
    const versionsUrl = new URL("/deployments/versions", this.apiBase);

    this.adminAuthEndpoint = authUrl.toString();
    this.apiAuthEndpoint = authUrl.toString();
    this.deployEndpoint = deployUrl.toString();
    this.repairEndpoint = repairUrl.toString();
    this.versionsEndpoint = versionsUrl.toString();

    this.version = core.getInput("version");
    this.configPath = core.getInput("config-path");
  }

  async authenticate() {
    core.info("Authenticating");
    const adminCredentials = {
      username: this.adminUsername,
      password: this.adminPassword,
    };
    const apiCredentials = {
      tenantName: this.tenantName,
      username: this.apiUsername,
      password: this.apiPassword,
    };
    const [adminAuthResponse, apiAuthResponse] = await Promise.all([
      axios.post<AuthResponse>(this.adminAuthEndpoint, adminCredentials),
      axios.post<AuthResponse>(this.apiAuthEndpoint, apiCredentials),
    ]);
    core.info("Authenticated successfully");
    this.adminAuthToken = adminAuthResponse.data.authorizationToken;
    this.apiAuthToken = apiAuthResponse.data.authorizationToken;
  }

  zipDir() {
    core.info("Zipping configuration");
    return new Promise<string>((resolve, reject) => {
      const fileName = `${Math.floor(Math.random() * 10000000)}-config.zip`;
      const outputPath = path.join(os.tmpdir(), fileName);
      const output = fs.createWriteStream(outputPath);
      output.on("finish", () => {
        core.info(`Configuration zipped ${outputPath}`);
        resolve(outputPath);
      });

      const archive = archiver.create("zip");
      archive.pipe(output);
      archive.directory(this.configPath, false);
      archive.finalize();
    });
  }

  async getAllVersions() {
    const res = await axios.get<ConfigVersionResponse[]>(
      this.versionsEndpoint,
      {
        headers: {
          Authorization: `Bearer ${this.apiAuthToken}`,
        },
      }
    );
    return res.data;
  }

  async deployConfig() {
    const versions = await this.getAllVersions();
    const isRepair = versions.some((v) => v.version === this.version);
    const endpoint = isRepair ? this.repairEndpoint : this.deployEndpoint;

    const zipPath = await this.zipDir();

    const form = new FormData();
    form.append("tenantName", this.tenantName);
    form.append("zipFile", fs.createReadStream(zipPath));

    if (isRepair) {
      core.info(`Repairing version ${this.version}`);
      form.append("version", this.version);
    } else {
      core.info("Deploying new version");
    }

    const deployResponse = await axios.post<DeployResponse>(endpoint, form, {
      headers: form.getHeaders({
        Authorization: this.adminAuthToken,
      }),
      maxBodyLength: 100000000,
      maxContentLength: 100000000,
    });

    if (deployResponse.data.success) {
      core.info(deployResponse.data.logfile);
      core.info("Deployment successful");
      core.setOutput("hostname", deployResponse.data.hostname);
    } else {
      core.setFailed(deployResponse.data.logfile);
    }
  }

  async run() {
    try {
      await this.authenticate();
      await this.deployConfig();
    } catch (error) {
      core.setFailed(error);
    }
  }
}

const deploymentManager = new DeploymentManager();
deploymentManager.run();
