from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import time
import urllib.request
import uuid
import zipfile

import minecraft_launcher_lib as mc

game = Path("/tmp/cobblestar-qa")
game.mkdir(exist_ok=True)
java = str(Path(os.environ["JAVA_HOME"]) / "bin/java")

def download(url, target, digest, algorithm="sha1"):
    for attempt in range(3):
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(url, timeout=75) as response, target.open("wb") as out:
                shutil.copyfileobj(response, out)
            if hashlib.new(algorithm, target.read_bytes()).hexdigest() != digest:
                raise ValueError("empreinte incorrecte: " + str(target))
            return
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)

def remote_json(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        return json.load(response)

pack = Path("modpack/CobbleStar-1.1.3.mrpack")
with zipfile.ZipFile(pack) as z:
    index = json.loads(z.read("modrinth.index.json"))
    def install_file(f):
        download(f["downloads"][0], game / f["path"], f["hashes"]["sha512"], "sha512")
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(install_file, (f for f in index["files"] if f["path"].startswith(("mods/", "resourcepacks/")) and f.get("env", {}).get("client") != "unsupported")))
    for name in z.namelist():
        if not name.startswith(("overrides/mods/", "overrides/resourcepacks/", "overrides/config/openloader/")) or name.endswith("/"):
            continue
        dest = game / name.removeprefix("overrides/")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(z.read(name))
shutil.copyfile(".qa/rig-audit.jar", game / "mods/rig-audit.jar")
packs = ["vanilla", "fabric", "cobblemon:gyaradosjump", "cobblemon:regionbiasforms",
         "file/E19 Cobblemon Minimap Icons.zip", "file/PackPackStar.zip", "file/NouveauTags.zip"]
(game/"options.txt").write_text("version:3955\nresourcePacks:" + json.dumps(packs) + "\nonboardAccessibility:false\nnarrator:0\nsoundCategory_master:0.0\nrenderDistance:2\n")
manifest = remote_json("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
version = remote_json(next(v["url"] for v in manifest["versions"] if v["id"] == "1.21.1"))
assets = remote_json(version["assetIndex"]["url"])["objects"]
def get_asset(h):
    download("https://resources.download.minecraft.net/" + h[:2] + "/" + h, game / "assets/objects" / h[:2] / h, h)
with ThreadPoolExecutor(20) as pool:
    list(pool.map(get_asset, {f["hash"] for f in assets.values()}))
print("Pack et ressources installés", flush=True)
mc.fabric.install_fabric("1.21.1", game, loader_version="0.19.3", java=java)
options = dict(username="CobbleStarTest", uuid=str(uuid.uuid4()), token="", executablePath=java,
               jvmArguments=["-Xmx5500M","-Xms384M","-XX:ActiveProcessorCount=3","-XX:+UseSerialGC"],
               customResolution=True, resolutionWidth="480", resolutionHeight="320")
cmd = mc.command.get_minecraft_command("fabric-loader-0.19.3-1.21.1", game, options)
with (game/"rig.log").open("w") as log:
    subprocess.run(cmd, cwd=game, stdout=log, stderr=subprocess.STDOUT, timeout=480)
result = game/"probe-result.txt"
if not result.is_file() or not result.read_text().startswith("PASS"):
    print((game/"rig.log").read_text(errors="replace")[-12000:])
    raise RuntimeError("Le client de test n’a pas terminé ses contrôles.")
report = json.loads((game/"report.json").read_text())
print(result.read_text())
print("Espèces, configurations, couples:",report["species"],report["states"],report["rigPairs"])
assert report["species"] >= 1031
assert all(any(path in s for s in report["activePacks"]) for path in ("cobblestar-alolan-sandshrew","cobblestar-modeles-1-8"))
log = (game/"rig.log").read_text(errors="replace")
assert "[RIG-END] cobblemon:yveltal" in log and "[RIG-END] cobblemon:metagross" in log
assert "fly_idle''" not in log
assert not any("T-posing!" in l and "animation.metagross.ground_idle" in l for l in log.splitlines())
for issue in report["issues"]:
    print(issue["kind"], issue["species"], issue["aspects"], issue["detail"][:120])
assert not any(i["kind"] in ("CRASH","FALLBACK","TEXTURE_ERROR","TEXTURE") for i in report["issues"])
