/*{
  "DESCRIPTION": "Twinkling stars fade in and out at random positions across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = isf_FragNormCoord;

  vec2 cellCoord;
  if (RENDERSIZE.y < 2.0) {
    cellCoord = vec2(uv.x * density, 0.0);
  } else {
    cellCoord = uv * density;
  }

  vec2 cell = floor(cellCoord);
  vec2 f = fract(cellCoord);

  vec3 col = vec3(0.0);

  for (int oy = 0; oy <= 1; oy++) {
    for (int ox = 0; ox <= 1; ox++) {
      vec2 neighbor = vec2(float(ox), float(oy));
      vec2 gid = cell + neighbor;

      float rnd = hash(gid);
      vec2 starPos = neighbor + vec2(hash(gid + 3.7), hash(gid + 9.2)) * 0.6 + 0.2;
      vec2 diff = f - starPos;
      float dist = length(diff);

      float phase = rnd * 6.2831853;
      float twinkleSpeed = 0.5 + rnd * 1.5;
      float twinkle = 0.5 + 0.5 * sin(TIME * speed * twinkleSpeed + phase);
      twinkle = pow(twinkle, mix(1.0, 4.0, sharpness));

      float radius = mix(0.35, 0.12, sharpness);
      float star = smoothstep(radius, 0.0, dist) * twinkle;

      vec3 starColor = mix(colorA.rgb, colorB.rgb, hash(gid + 5.5));
      col += starColor * star;
    }
  }

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
