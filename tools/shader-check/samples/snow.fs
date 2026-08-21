/*{
  "DESCRIPTION": "Gently falling snow with twinkling lights",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "snowColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "skyColor", "TYPE": "color", "DEFAULT": [0.0, 0.1, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 3.0, "DEFAULT": 1.5 }
  ]
}*/

float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  
  float ab = mix(a, b, f.x);
  float cd = mix(c, d, f.x);
  return mix(ab, cd, f.y);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float isLine = step(RENDERSIZE.y, 1.5);
  vec2 snowUv = vec2(uv.x, mix(uv.y, uv.x * 0.5, isLine));
  
  vec2 animated = snowUv * scale;
  animated.y -= TIME * speed * 0.3;
  
  float n = noise(animated * 8.0);
  float snowPattern = smoothstep(0.4, 0.6, n) * density;
  
  float twinkle = 0.5 + 0.5 * sin(TIME * 3.0 + hash(floor(animated)) * 6.28);
  snowPattern *= twinkle;
  
  vec3 finalColor = mix(skyColor.rgb, snowColor.rgb, snowPattern);
  gl_FragColor = vec4(finalColor, 1.0);
}
