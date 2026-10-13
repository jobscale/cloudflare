## cloudflare dynamic DNS

## run with container
```
git clone https://github.com/jobscale/cloudflare.git
cd cloudflare
```

## build and run
```
main() {
  docker build . -t local/cloudflare
  docker run --rm -it local/cloudflare
} && main
```

### create cronjob
```
kubectl create cronjob cloudflare --image local/cloudflare --schedule '0/7 * * * *'
kubectl create job --from=cronjob/cloudflare cloudflare-manual-$(date +'%Y%m%d-%H%M')
```
