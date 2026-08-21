/*{
  "DESCRIPTION": "Gently falling snow with twinkling lights",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "snowColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "skyColor", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.1, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 0.3 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.8 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float yOffset = mod(TIME * speed, 2.0);
  
  vec2 snowUV = uv * vec2(8.0, 6.0);
  snowUV.y += yOffset * 6.0;
  
  float snowNoise = noise(snowUV);
  snowNoise += noise(snowUV * 2.0) * 0.5;
  snowNoise = smoothstep(0.3, 0.7, snowNoise * density);
  
  float twinkle = 0.5 + 0.5 * sin(TIME * 3.0 + hash(floor(snowUV)) * 6.28);
  snowNoise *= mix(0.5, 1.0, twinkle);
  
  vec3 col = mix(skyColor.rgb, snowColor.rgb, snowNoise);
  
  gl_FragColor = vec4(col, 1.0);
}
