/*{
  "DESCRIPTION": "Fireworks bursting outward from random points with trailing sparks",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME * speed;
  
  vec3 col = vec3(0.0);
  
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    
    vec2 center = vec2(hash(vec2(fi, 1.0)), hash(vec2(fi, 2.0)));
    float burst_time = mod(t * 0.6 + hash(vec2(fi, 3.0)), 2.0);
    
    float burst_radius = burst_time * 0.5;
    float burst_age = burst_time;
    
    float dist_to_center = length(uv - center);
    float shell = abs(dist_to_center - burst_radius);
    
    float brightness = (1.0 - burst_age) * (1.0 - smoothstep(0.0, 0.03, shell));
    
    vec3 spark_col;
    if (mod(fi, 3.0) < 1.0) {
      spark_col = colorA.rgb;
    } else if (mod(fi, 3.0) < 2.0) {
      spark_col = colorB.rgb;
    } else {
      spark_col = colorC.rgb;
    }
    
    col += spark_col * brightness * 0.8;
  }
  
  col = min(col, vec3(1.0));
  gl_FragColor = vec4(col, 1.0);
}
