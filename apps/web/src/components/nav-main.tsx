'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'

export function NavMain({
  items,
}: {
  items: {
    title: string
    url?: string
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    icon?: any
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    hugeIcon?: any
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navegación</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isItemActive = item.url ? pathname.startsWith(item.url) : false
          const isAnyChildActive = item.items?.some((subItem) => pathname.startsWith(subItem.url))

          if (item.items && item.items.length > 0) {
            return (
              <Collapsible
                key={item.title}
                asChild
                defaultOpen={item.isActive || isAnyChildActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={item.title}>
                      {item.hugeIcon ? (
                        <HugeiconsIcon icon={item.hugeIcon} />
                      ) : (
                        item.icon && <item.icon />
                      )}
                      <span>{item.title}</span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => {
                        const isSubItemActive = pathname.startsWith(subItem.url)
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild isActive={isSubItemActive}>
                              <Link href={subItem.url}>
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            )
          }

          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild tooltip={item.title} isActive={isItemActive}>
                <Link href={item.url!}>
                  {item.hugeIcon ? (
                    <HugeiconsIcon icon={item.hugeIcon} />
                  ) : (
                    item.icon && <item.icon />
                  )}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
