-- Build an animated GIF from a directory of fNNN-*.png frames.
-- Usage:
--   Aseprite -b --script scripts/aseprite-frames-to-gif.lua \
--     --script-param dir=... --script-param out=... --script-param ms=160

local dir = app.params["dir"]
local out = app.params["out"]
local ms = tonumber(app.params["ms"] or "160") or 160

if not dir or not out then
  print("missing dir/out")
  return
end

local files = {}
for _, file in ipairs(app.fs.listFiles(dir)) do
  if string.match(string.lower(file), "%.png$") then
    table.insert(files, app.fs.joinPath(dir, file))
  end
end
table.sort(files)

if #files == 0 then
  print("no frames in " .. dir)
  return
end

local first = app.open(files[1])
if not first then
  print("failed to open " .. files[1])
  return
end

app.activeSprite = first
local spr = app.activeSprite
spr.frames[1].duration = ms / 1000

for i = 2, #files do
  local other = app.open(files[i])
  if not other then
    print("failed to open " .. files[i])
    return
  end
  app.activeSprite = other
  app.command.ChangePixelFormat { format = "rgb" }
  local cel = other.layers[1]:cel(1)
  local image = cel.image:clone()
  local pos = cel.position
  other:close()

  app.activeSprite = spr
  app.transaction(function()
    local frame = spr:newEmptyFrame()
    frame.duration = ms / 1000
    spr:newCel(spr.layers[1], frame, image, pos)
  end)
end

app.activeSprite = spr
spr:saveCopyAs(out)
print("wrote " .. out .. " frames=" .. #spr.frames)
spr:close()
