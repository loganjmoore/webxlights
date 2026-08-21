/*{
  "DESCRIPTION": "Slow lava lamp blobs that drift and morph through the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME * speed * 0.3;
  
  float blob1 = noise(uv.x * scale + t * 0.7 + noise(t * 0.3) * 2.0);
  blob1 += noise(uv.x * scale * 0.5 + t * 0.5 + 10.0) * 0.5;
  blob1 = smoothstep(0.3, 0.7, blob1);
  
  float blob2 = noise(uv.x * scale * 0.8 + t * 0.4 + 100.0 + noise(t * 0.2 + 50.0) * 2.0);
  blob2 += noise(uv.x * scale * 0.3 + t * 0.6 + 200.0) * 0.5;
  blob2 = smoothstep(0.2, 0.8, blob2);
  
  float blend = sin(t * 0.4) * 0.5 + 0.5;
  float combined = mix(blob1, blob2, blend);
  combined = smoothstep(0.2, 0.9, combined);
  
  vec3 color = mix(colorA.rgb, colorB.rgb, sin(t * 0.2) * 0.5 + 0.5);
  color *= combined;
  
  gl_FragColor = vec4(color, 1.0);
}
