import axios from "axios";
import archiver from "archiver";
import * as core from "@actions/core";
import FormData from "form-data";
import fs from "fs";
import os from "os";
import path from "path";
import { exec } from "child_process";

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

interface DeployResponse {
  hostname: string;
  logfile: string;
  success: boolean;
  tenantName: string;
}

const run = async () => {
  try {
    const username = core.getInput("username");
    const password = core.getInput("password");
    const authEndpoint = core.getInput("auth-endpoint");
    const deployEndpoint = core.getInput("deploy-endpoint");
    const tenantName = core.getInput("tenant-name");

    const authResponse = await axios.post<AuthResponse>(authEndpoint, { username, password });

    core.info("Authentication successful");

    const zipPath = await zipDir(".");

    const form = new FormData();
    form.append("tenantName", tenantName);
    form.append("zipFile", fs.createReadStream(zipPath));

    core.info("Deploying...");

    const deployResponse = await axios.post<DeployResponse>(deployEndpoint, form, {
      headers: form.getHeaders({
        Authorization: authResponse.data.authorizationToken
      }),
      maxBodyLength: 100000000,
      maxContentLength: 100000000
    });

    if (deployResponse.data.success) {
      core.info(deployResponse.data.logfile);
      core.info("Deployment successful")
      core.setOutput("hostname", deployResponse.data.hostname)
    } else {
      core.setFailed(deployResponse.data.logfile);
    }
  } catch (error) {
    console.log(error.response.data);
    core.setFailed(error.message);
  }
};

const zipDir = (dirPath: string) => {
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
    archive.directory(dirPath, false);
    archive.finalize();
  });
};

run();
