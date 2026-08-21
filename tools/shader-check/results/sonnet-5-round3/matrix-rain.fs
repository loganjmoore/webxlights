/*{
  "DESCRIPTION": "Green digital rain streaks falling down the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.2, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.3, 0.05, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 2.0, "MAX": 24.0, "DEFAULT": 10.0 },
    { "NAME": "streakLength", "TYPE": "float", "MIN": 0.1, "MAX": 0.9, "DEFAULT": 0.4 }
  ]
}*/

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isRoofline = RENDERSIZE.y < 2.0;

  // pick the axis that carries the falling motion
  float across = isRoofline ? uv.y : uv.x;
  float along = isRoofline ? uv.x : uv.y;

  float lane = floor(across * density);
  float laneFrac = fract(across * density);

  float laneSeed = hash11(lane + 1.0);
  float laneSpeed = 0.5 + laneSeed * 1.5;
  float offset = hash11(lane + 50.0);

  // falling position for this lane, 0..1 wrapping, seamless loop
  float fallPos = fract(along + offset - TIME * speed * laneSpeed * 0.3);

  // streak: bright head, fading tail behind it (tail is at higher fallPos, since we subtract)
  float tailLen = clamp(streakLength, 0.05, 0.95);
  float streak = 1.0 - smoothstep(0.0, tailLen, fallPos);

  // narrow the lane so streaks look like columns not full bands
  float laneMask = smoothstep(0.0, 0.15, laneFrac) * smoothstep(1.0, 0.85, laneFrac);

  float brightness = streak * laneMask;

  // occasional flicker/sparkle at the head
  float head = smoothstep(0.0, 0.06, fallPos) * (1.0 - smoothstep(0.06, 0.14, fallPos));
  brightness = max(brightness, head * laneMask);

  vec3 col = mix(colorB.rgb, colorA.rgb, clamp(brightness * 1.3, 0.0, 1.0));
  col *= max(brightness, 0.06);

  gl_FragColor = vec4(col, 1.0);
}
