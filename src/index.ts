import { getInput } from '@actions/core';
import { mkdirP, cp, rmRF } from '@actions/io';
import { safeLoad } from 'js-yaml';
import { readFile, writeFile } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { tgz } from 'compressing';

interface AssetMetaData {
    guid: string;
    folderAsset: 'yes' | 'no' | undefined
}

const MakeTGZ = async (tmpFolder: string, output: string) => {
    await tgz.compressDir(tmpFolder, output);
    await rmRF(tmpFolder);
};

const CreateOneAssetFolder = (metaFileRelativePathWithExtension: string, projectRoot: string, destination: string, index: number, output: string, processHasDone: boolean[]) => {
    const metaFileAbsolutePath = join(projectRoot, metaFileRelativePathWithExtension);
    readFile(metaFileAbsolutePath, { encoding: "utf-8" }, async (err, data) => {
        if (err) {
            throw err;
        }
        const metaDatum: AssetMetaData = safeLoad(data);
        const guid = metaDatum.guid;
        const dir = join(destination, guid);

        await mkdirP(dir);

        const assetMetaCpPromise: Promise<void> = cp(metaFileAbsolutePath, join(dir, "asset.meta"));

        if (metaDatum.folderAsset !== "yes") {
            const assetFileAbsolutePath = metaFileAbsolutePath.substr(0, metaFileAbsolutePath.length - 5);
            await cp(assetFileAbsolutePath, join(dir, "asset"));
        }

        const assetFileRelativePath = metaFileRelativePathWithExtension.substr(0, metaFileRelativePathWithExtension.length - 5);
        writeFile(join(dir, "pathname"), assetFileRelativePath, async () => {
            await assetMetaCpPromise;
            processHasDone[index] = true;
            if (processHasDone.indexOf(false) === -1)
                await MakeTGZ(destination, output);
        });
    });
};

const ProcessMetaFiles = (metaFiles: string[], projectRoot: string, tmpFolder: string, output: string, processHasDone: boolean[]) => {
    metaFiles.forEach((metaFilePath, index, _) => {
        CreateOneAssetFolder(metaFilePath, projectRoot, tmpFolder, index, output, processHasDone);
    });
};

const IsNotNullOrWhiteSpace = (value: string) => value && value.trim();

const Split = (linesConcat: string) => {
    const splits = linesConcat.split(/\r\n|\n|\r/);
    return splits.filter(IsNotNullOrWhiteSpace);
};

const Run = () => {
    const output = getInput("package-path", { required: true });

    const projectFolder = getInput("project-folder", { required: false }) ?? "./";

    const includeFiles = getInput("include-files", { required: true });
    const tmpFolder = tmpdir();
    const metaFiles = Split(includeFiles);
    const processHasDone = new Array(metaFiles.length);
    processHasDone.fill(false);
    ProcessMetaFiles(metaFiles, projectFolder, tmpFolder, output, processHasDone);
};

Run();